$(document).ready(function() {
                    for (var n in networks) {
                      for (var c in networks[n].channels) {
                        addChannel(networks[n].channels[c], networks[n]);
                      }
                    }
                    $("#tabs > section > h3").click(switchChannel);
                    $("#chatinput").keydown(chatInput);
                  });

function bool(str) {
  return str == "true";
}

function switchChannel() {
  switchTab(this);
  var current = $('#tabs section.current');
  activenetwork = networks[current.prop('network')];
  activenetwork.SetActiveTarget(current.prop('name'));
}

function chatInput(event) {
  if (event.which == 13 && this.value != "") { // return
    if (this.value[0] == "/") {
      var cmd = this.value;
      var text = "";
      var space = this.value.indexOf(" ");
      if (space != -1) {
        cmd = this.value.substring(1, space);
        text = this.value.substring(space + 1);
      }

      OnCommand(cmd, text);
    }
    else {
      activenetwork.OnSendMessage(this.value, false);      
    }
    this.value = "";
  }
}

// EventSource handling
var source = new EventSource("events");

function makeEventListener(f) {
  return function (e) {
    f(JSON.parse(e.data));
  };
}

source.addEventListener(
  "message",
  makeEventListener(function(data) {
                      //document.getElementById("d").innerHTML += e.data + "<br>";
                    }));

source.addEventListener(
  "chanmsg", 
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var c = n.channels[data.channel];
      c.OnMessage(data.user, data.msg, bool(data.action), bool(data.self));
      updateChannel(c, n);
    }));

source.addEventListener(
  "privmsg",
  makeEventListener(
    function(data) {
      networks[data.network].OnPrivmsg(data.user, data.msg, bool(data.action), bool(data.self));
    }));

source.addEventListener(
  "op",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var c = n.channels[data.channel];
      c.OnOp(data.user, data.op, bool(data.opped));
      updateChannel(c, n);
    }));

source.addEventListener(
  "voice",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var c = n.channels[data.channel];
      c.OnVoice(data.user, data.op, bool(data.voiced));
      updateChannel(c, n);
    }));

source.addEventListener(
  "kick",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var c = n.channels[data.channel];
      c.OnKick(data.user, data.op, data.msg);
      updateChannel(c, n);
    }));

source.addEventListener(
  "quit",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var channels = n.OnUserQuit(data.user, data.mask, data.channels, data.msg);
      for (var i = 0; i < channels.length; i++) {
        updateChannel(channels[i], n, true);
      }
    }));

source.addEventListener(
  "join",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      if (bool(data.self) && !(data.channel in n.channels)) {
        n.JoinedChannel(data.channel, '');
        addChannel(n.channels[data.channel], n);
        $('#tabs > section.current > h3').click(switchChannel);
        n.channels[data.channel].OnUserJoin(data.user, data.mask);
        updateChannel(c, n, true);
      }
      else {
        var c = n.channels[data.channel];
        n.channels[data.channel].OnUserJoin(data.user, data.mask);
        updateChannel(c, n, true);
      }
    }));

source.addEventListener(
  "names",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var c = n.channels[data.channel];
      c.SetUsers(data.nicks);
      updateChannelUsers(c, n);
    }));

source.addEventListener(
  "part",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      if (bool(data.self)) {
        removeChannel(n.channels[data.channel], n);
        n.PartedChannel(data.channel);
      }
      else {
        var c = n.channels[data.channel];
        c.OnUserPart(data.user, data.mask, data.msg);
        updateChannel(c, n, true);
      }
    }));

source.addEventListener(
  "nick",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var channels = n.OnUserNick(data.old, data.new, data.channels);
      for (var i = 0; i < channels.length; i++) {
        updateChannel(channels[i], n, true);
      }
    }));

source.addEventListener(
  "topic",
  makeEventListener(
    function(data) {
      var n = networks[data.network];
      var c = n.channels[data.channel];
      c.OnTopic(data.user, data.topic, bool(data.self));
      updateChannel(c, n);
    }));
