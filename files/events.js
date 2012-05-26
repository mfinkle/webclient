$(document).ready(function() {
  console.log("page init")
  var hash = location.hash;
  if (hash)
    location = location.href.replace(hash, "");

  for (var n in networks) {
    for (var c in networks[n].channels) {
      addChannel(networks[n].channels[c], networks[n]);
    }
  }

  $("div.channel-page").live("pageshow", function(event, ui) {
    var hash = location.hash;
    var page = $(hash);

    activeNetwork = networks[page.attr("network")];
    activeNetwork.SetActiveTarget(page.attr("name"));
  });

  $(".persistent").live("change", function(event) {
    var options = {
      messageOrder: $("input[name='message-order']:checked").val(),
      highlight: $("#highlight").val(),
      highlightWords: $("#highlight-words").val()
    };
    localStorage.setItem("options", JSON.stringify(options));
  });

  var options = JSON.parse(localStorage.getItem("options"));
  if (!options)
    options = { messageOrder: "p", highlight: "off", highlightWords: "" };

  $("input[name='message-order']").val(options.messageOrder);
  $("#highlight").val(options.highlight);
  $("#highlight-words").val(options.highlightWords);

  document.cookie = location.port + "-Last-Event-ID=0";
  var source = new EventSource("events");

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

  $("#postinput").keydown(onPostInput);
});

$(document).bind("pageloadfailed", function( event, data ) {
  console.log("page load failed")
});

function bool(str) {
  return str == "true";
}

function onPostInput(event) {
  if (event.which == 13 && this.value != "") { // return
    sendPost(this);
    $("#post").dialog("close");
  }
}

function sendPost(element) {
  if (element.value[0] == "/") {
    var cmd = element.value;
    var text = "";
    var space = element.value.indexOf(" ");
    if (space != -1) {
      cmd = element.value.substring(1, space);
      text = element.value.substring(space + 1);
    }

    OnCommand(cmd, text);
  } else {
    activeNetwork.OnSendMessage(element.value, false);      
  }
  element.value = "";
}

function makeEventListener(f) {
  return function (e) {
    try {
      var data = JSON.parse(e.data);
    } catch (e) {
      return;
    }

    document.cookie = location.port + "-Last-Event-ID=" + (data.id ? data.id : "0");
    f(data);
  };
}

