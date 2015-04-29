/**
 * @namespace IoT
 * @summary The namespace for all IoT-related methods and classes.
 */

IoT = {};
IoT.Home = {};
IoT.Device = {};
IoT.Device.devices = judevs;
IoT.Device.properties = juhome;

Meteor.publish("iot-devices",function(){
  return IoT.Device.devices.find();
});

Meteor.publish("iot-properties",function(){
  return IoT.Device.properties.find();
});

IoT.Device.get = function(devid) {
  return IoT.Device.devices.findOne({'devid':devid});
};

IoT.Home.installDevice = function(devid,location) {
  IoT.Device.devices.update({devid:devid},{$set:{'location': location}});
  IoT.Device.properties.update({devid:devid},{$set:{'location': location}},{multi:true});
};

IoT.Home.authorize = function(app,locations) {
  _.each(locations,function(location) {
    console.log(app + ' authorized to ' + location);
    IoT.Device.properties.update({'location':location},{$addToSet: {'authorized': app}},{multi:true});
    // ToDo 细粒度的权限控制
    IoT.Device.properties.allow({
      update: function(userId,doc) {
        return true;
      }
    });
  });
};

IoT.uuid = function() {
  return Random.id();
}

IoT.Home.follow = function(foregoer,follower) {
  var handler = IoT.Device.properties.findOne({'pid': foregoer.pid}).observeChanges({
    changed: function(id,value) {
      if(value === foregoer.value) {
        IoT.Device.properties.update({'pid':follower.pid},{$set: {'value': follower.value}});
      }
    }
  })
}

Meteor.methods({
  add: function(device) {
    var devid = IoT.uuid();
    var dev = {
      location: 'Home',
      devid: devid,
      type: device.type,
      about: device.about,
      connector: device.connector,
    };

    IoT.Device.devices.insert(dev,function(err,result) {
      if(err) return cb(err);

      _.each(device.properties,function(property) {
        property.pid = IoT.uuid();
        property.devid = devid;
        property.timestamp = new Date().getTime();
        property.friends = [];

        IoT.Device.properties.insert(property,function(err,result) {
          if(err) return cb(err);
          console.log('add property:\n', property);
        });
      });
    });

    Meteor.publish('jubo_iot_device_' + dev.devid, function(devid) {
      var self = this;
      var handler = IoT.Device.properties.find({'devid':devid},{fields: {'label': 0}}).observe({
        added: function(doc) {
          self.added('jubo_iot_properties',doc._id,doc);
        },

        changed: function(doc) {
          self.changed('jubo_iot_properties',doc._id,doc);
        }
      });

      self.ready();
    });

    return devid;
  },

  setproperty: function(property) {
    var self = this;
    var timestamp = new Date().getTime();
    var friends = IoT.Device.properties.find(
      { $and: [{'timestamp': {$gt: (timestamp - 30*1000)}},{'timestamp': {$lt: timestamp}}]});

    var me = IoT.Device.properties.findOne(
      {'devid': property.devid,
        'service': property.service,'property': property.property});

    var noRelation = function(relationship,index,array) {
      if(relationship.friend === friend._id) {
        relationship.friendship--;
        return false;
      } else {
        return true;
      }
    };

    // gather survival rules
    var gatherRules = function(instance) {
      _.each(instance.rules,function(rule) {
        var property = IoT.Device.properties.findOne({'pid': rule.pid});
        console.log('gather rule:',rule,'value:',property.value);
        IoT.Device.properties.update(
          {'pid': instance.pid,"rule.pid": rule.pid},
          {$set: {'rule.$.value': property.value}});
      });

    };

    var survived = function(id) {
      return true;
    };

    var follow = function(friend,me) {
      IoT.Device.properties.update(
        {'_id': me._id},{$addToSet: {friends: {'friend': friend.pid, 'friendship': 0}}});

      var handler = IoT.Device.properties.find(
        {'pid': friend.pid}).observeChanges({
        changed: function(id,value) {
          if(survived(id)) { 
            console.log('friend\'s state changed',friend);
            IoT.Device.properties.update(
              {'_id': me._id, "friends.friend": friend.pid},
              {$inc: {"friends.$.friendship": 1}});
          }
        }
      });
    };

    IoT.Device.properties.update(
      {'_id':me._id},
      {$set:{'value': property.value,'timestamp': timestamp}});

    gatherRules(me);
    friends.forEach(function(friend)  {
      if(me.friends.every(noRelation)) {
        console.log('---------',me,' follow ',friend);
        follow(friend,me);
      }
    });
  },

  feedback: function(err,property) {
    if(err && property) {
      IoT.Device.properties.update({'devid': property.devid},{$set:{'value': value}});
    }
  },

  remove: function(devid) {
    IoT.Device.devices.remove({'devid':devid});
    IoT.Device.properties.remove({'devid':devid});
  },

  createHomeSlice: function(name) {
    console.log('crate home slice',name);
    Meteor.publish('jubo_iot_home_slice_' + name,function(name) {
      var self = this;
      var handler = IoT.Device.properties.find({'authorized':name},{fields: {'authorized':0}}).observe({
        added: function(doc) {
          self.added('jubo_iot_properties',doc._id,doc);
          //console.log('publish added:',doc);
        },
        changed: function(doc) {
          self.changed('jubo_iot_properties',doc._id,doc);
          //console.log('publish changed:',doc);
        }
      });

      self.ready();
    });
  },

  requestAuthorization: function(app,locations) {
    console.log('Application ' + app + 'request authorization ' + locations);
  }
});
