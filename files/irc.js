var activeNetwork = null;

function OnCommand(cmd, text) {
  console.log("OnCommand(" + cmd + ", " + text + ")");
  switch (cmd) {
  case "me":
    activeNetwork.OnSendMessage(text, true);
    break;
  }
}

function splitlist(list) {
  return list.split(",");
}

function IRCNetwork(name, nick, channels) {
  this.name = name;
  this.nick = nick;
  this.channels = {};
  this.activetarget = null;
  for (var i = 0; i < channels.length; i++) {
    if (!this.activetarget)
      this.activetarget = channels[i];
    this.channels[channels[i].name] = channels[i];
  }
  this.privmsgs = {};
}

IRCNetwork.prototype = {
  toString: function() {
    return "[IRCNetwork " + this.name + "]";
  },

  JoinedChannel: function(channel, topic) {
    var c = new Channel(channel, topic, []);
    this.channels[channel] = c;
    this.activetarget = c;
  },

  PartedChannel: function(channel) {
    var c = this.channels[channel];
    delete this.channels[channel];
    if (c == this.activetarget) {
      this.activetarget = null;
    }
  },

  OnUserQuit: function(user, mask, channels, msg) {
    var affected = [];
    var chanlist = splitlist(channels);
    for (var i = 0; i < chanlist.length; i++) {
      var c = this.channels[chanlist[i]];
      c.OnUserQuit(user, mask, msg);
      affected.push(c);
    }
    return affected;
  },

  OnUserNick: function(oldNick, newNick, channels) {
    var affected = [];
    var chanlist = splitlist(channels);
    for (var i = 0; i < chanlist.length; i++) {
      var c = this.channels[chanlist[i]];
      c.OnUserNick(oldNick, newNick);
      affected.push(c);
    }
    return affected;
  },

  OnPrivmsg: function(user, msg, action, self) {
    if (!(user in this.privmsgs))
      this.privmsgs[user] = [];
    this.privmsgs[user].push({msg: msg,
                              action: action,
                              self: self});
  },

  SetActiveTarget: function(target) {
    if (target in this.channels) {
      this.activetarget = this.channels[target];
    }
    else if (target in this.privmsgs){
      this.activetarget = this.privmsgs[target];
    }
  },

  OnSendMessage: function(text, action) {
    if (this.activetarget)
      this.activetarget.SendMessage(this, text, action);
  }
};

function Channel(name, topic, users) {
  this.name = name;
  this.topic = topic || '';
  this.users = users ? splitlist(users) : [];
  this.scrollback = [];
}

Channel.prototype = {
  toString: function() {
    return "[Channel " + this.name + "]";
  },

  SetUsers: function(nicklist) {
    this.users = splitlist(nicklist);
  },

  OnMessage: function(user, msg, action, self) {
    this.scrollback.push({user: user,
                          msg: msg,
                          type: action ? "action" : "message",
                          self: self});
  },

  OnUserJoin: function(user, mask) {
    //TODO: maintain sorted userlist
    this.users.push(user);
    this.scrollback.push({type: "join",
                          user: user,
                          mask: mask});
  },

  OnUserPart: function(user, mask, msg) {
    var index = this.users.indexOf(user);
    if (index >= 0)
      this.users.splice(index, 1);
    this.scrollback.push({type: "part",
                          user: user,
                          mask: mask,
                          msg: msg});
  },

  OnUserQuit: function(user, mask, msg) {
    var index = this.users.indexOf(user);
    if (index >= 0)
      this.users.splice(index, 1);
    this.scrollback.push({type: "quit",
                          user: user,
                          mask: mask,
                          msg: msg});
  },

  OnUserNick: function(oldNick, newNick) {
    var index = this.users.indexOf(oldNick);
    if (index >= 0)
      this.users.splice(index, 1, newNick);
    this.scrollback.push({type: "nick",
                          user: oldNick,
                          new: newNick});
  },

  OnTopic: function(user, topic, self) {
    this.topic = topic;
    this.scrollback.push({type: "topic",
                          user: user,
                          topic: topic,
                          self: self});
  },

  OnOp: function(user, op, opped) {
    //TODO: maintain list of ops
    this.scrollback.push({type: "op",
                          user: user,
                          op: op,
                          opped: opped});
  },

  OnVoice: function(user, op, voiced) {
    //TODO: maintain list of voiced users
    this.scrollback.push({type: "voice",
                          user: user,
                          op: op,
                          voiced: voiced});
  },

  OnKick: function(user, op, msg) {
    this.scrollback.push({type: "kick",
                          user: user,
                          op: op,
                          msg: msg});
  },

  SendMessage: function(network, text, action) {
    var url = "chanmsg/" + encodeURIComponent(network.name) + "/" + encodeURIComponent(this.name);
    console.log(url);
    $.post(url, { msg: text, action: action ? "true" : "", "_CSRF_Check": csrftoken});
  }
};
