var channels = {
};

var nextChannelID = 0;

function channelID(channel, network) {
  return channels[network.name + "-" + channel.name];
}

function buildUserList(element, channel) {
  $.each(channel.users, function(i, u) {
    element.append("<li>" + u);
  });
}

function addChannel(channel, network) {
  channels[network.name + "-" + channel.name] = "channel" + (nextChannelID++);
  $("#channels").append($.render["channelrow"]({ pageid: channelID(channel, network), title: channel.name, count: channel.scrollback.length }));
  $("#channels").listview();
  $("#channels").listview("refresh");
  
  $("body").append($.render["channelpage"]({ pageid: channelID(channel, network), title: channel.name }));
  $.mobile.initializePage();
  
  $("#" + channelID(channel, network)).attr("network", network.name).attr("name", channel.name);
  //updateChannelUsers(channel, network);
}

function removeChannel(channel, network) {
  var c = $("#" + channelID(channel, network));
  var current = null;
  if (c.hasClass('current')) {
    // find a new current tab
    current = c.prev();
    if (current.length == 0) {
      current = c.next();
    }
  }
  c.remove();
  if (current) {
    current.addClass('current');
  }
}

function escapeText(text) {
  return $("<div/>").text(text).html();
}

function updateChannelUsers(channel, network) {
  var l = $("#" + channelID(channel, network) + ' ul.users').empty();
  buildUserList(l, channel);
}

function replaceURLWithHTMLLinks(text) {
  var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  return text.replace(exp,"<a href='$1'>$1</a>"); 
}

function hasHighlightWord(message) {
  if ($("#highlight").val() == "off")
    return false;
  var words = $("#highlight-words").val().replace(/\r\n/g, "\n").split("\n");
  if (words.length == 0)
    return false;
  var wordsregex = new RegExp(words.join("|"), "gi");
  return message.search(wordsregex) != -1 ? true : false;
}

function updateChannel(channel, network, updatenicklist) {
  var m = channel.scrollback[channel.scrollback.length - 1];
  var content;
  var cls = "user";
  var user = escapeText(m.user);
  if (m.self)
    cls += " self";

  if (m.type == "message") {
    var msg = replaceURLWithHTMLLinks(escapeText(m.msg));
    if (navigator.mozNotification && hasHighlightWord(msg)) {
      var notification = navigator.mozNotification.createNotification("TinCan", "New mentions in " + channel.name);
      notification.onclick = function() { $.mobile.changePage($("#" + channelID(channel, network))); }
      notification.show();
    }
    content = '<li><span class="' + cls + '">&lt;' + user + '&gt;</span> <span class="message">' + msg + '</span>';
  } else if (m.type == "action") {
    content = '<li>* <span class="' + cls + '">' + user + '</span> <span class="message">' + escapeText(m.msg) + '</span>';
  } else if (m.type == "nick") {
    content = '<li class="usermode">--- <span class="' + cls + '">' + user + '</span> is now known as <span class="user">' + escapeText(m.new) + '</span>';
  } else if (m.type == "topic") {
    content = '<li class="topicchange">--- <span class="' + cls + '">' + user + '</span> set topic to <span class="topic">' + escapeText(m.topic) + '</span>';
  } else if (m.type == "join") {
    content = '<li class="join">--> <span class="' + cls + '">' + user + '</span> <span class="hostmask">('+ escapeText(m.mask) + ')</span> joined';
  } else if (m.type == "part") {
    content = '<li class="part"><-- <span class="' + cls + '">' + user + '</span> <span class="hostmask">('+ escapeText(m.mask) + ')</span> left (' + escapeText(m.msg) + ')';
  } else if (m.type == "quit") {
    content = '<li class="quit"><-- <span class="' + cls + '">' + user + '</span> <span class="hostmask">('+ escapeText(m.mask) + ')</span> quit (' + escapeText(m.msg) + ')';
  } else if (m.type == "op" || m.type == "voice") {
    var action = "";
    if (m.type == "op")
      action = m.opped ? "gave ops to" : "removed ops from";
    else
      action = m.voiced ? "gave voice to" : "removed voice from";
    content = '<li class="usermode"><span class="' + cls + '">' + escapeText(m.op) + '</span> ' + action + ' <span class="user">' + user + '</span>';
  } else if (m.type == "kick") {
    content = '<li class="usermode"><span class="' + cls + '">' + escapeText(m.op) + '</span> kicked <span class="user">' + user + '</span> (' + escapeText(m.msg) + ')';
  }

  $("#" + channelID(channel, network) + " ul.chat").prepend(content);
  $("#channel-" + channelID(channel, network) + " span.ui-li-count").html(channel.scrollback.length);

  //if (updatenicklist) {
    //updateChannelUsers(channel, network);
  //}
}
