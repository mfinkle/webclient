var channels = {
};

var nextChannelID = 0;

function switchTab(tab) {
  $('#tabs section').removeClass('current');
  $(tab).closest('section').addClass('current');
}

function channelID(channel, network) {
  return channels[network.name + "-" + channel.name];
}

function buildUserList(element, channel) {
  $.each(channel.users, function(i, u) {
           element.append("<li>" + u);
         });
}

function addChannel(channel, network) {
  $('#tabs section').removeClass('current');
  channels[network.name + "-" + channel.name] = "channel" + (nextChannelID++);
  $('#tabs').append('<section id="' + channelID(channel, network) + '" class="current"><h3>' + channel.name + '</h3><div><ul class="chat"></ul><ul class="users"></ul></div></section>');
  $('#tabs section.current').prop('network', network.name).prop('name', channel.name);
  updateChannelUsers(channel, network);
}

function removeChannel(channel, network) {
  var c = $('#' + channelID(channel, network));
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
  var l = $('#' + channelID(channel, network) + ' ul.users').empty();
  buildUserList(l, channel);
}

function updateChannel(channel, network, updatenicklist) {
  var m = channel.scrollback[channel.scrollback.length - 1];
  var content;
  var cls = "user";
  var user = escapeText(m.user);
  if (m.self)
    cls += " self";
  if (m.type == "message") {
    content = '<li><span class="' + cls + '">&lt;' + user + '&gt;</span> <span class="message">' + escapeText(m.msg) + '</span>';
  }
  else if (m.type == "action") {
    content = '<li>* <span class="' + cls + '">' + user + '</span> <span class="message">' + escapeText(m.msg) + '</span>';
  }
  else if (m.type == "nick") {
    content = '<li class="usermode"><span class="' + cls + '">' + user + '</span> is now known as <span class="user">' + escapeText(m.new) + '</span>';
  }
  else if (m.type == "topic") {
    content = '<li class="topicchange"><span class="' + cls + '">' + user + '</span> set topic to <span class="topic">' + escapeText(m.topic) + '</span>';
  }
  else if (m.type == "join") {
    content = '<li class="join"><span class="' + cls + '">' + user + '</span> <span class="hostmask">('+ escapeText(m.mask) + ')</span> joined';
  }
  else if (m.type == "part") {
    content = '<li class="part"><span class="' + cls + '">' + user + '</span> <span class="hostmask">('+ escapeText(m.mask) + ')</span> left (' + escapeText(m.msg) + ')';
  }
  else if (m.type == "quit") {
    content = '<li class="quit"><span class="' + cls + '">' + user + '</span> <span class="hostmask">('+ escapeText(m.mask) + ')</span> quit (' + escapeText(m.msg) + ')';
  }
  else if (m.type == "op" || m.type == "voice") {
    var action = "";
    if (m.type == "op")
      action = m.opped ? "gave ops to" : "removed ops from";
    else
      action = m.voiced ? "gave voice to" : "removed voice from";
    content = '<li class="usermode"><span class="' + cls + '">' + escapeText(m.op) + '</span> ' + action + ' <span class="user">' + user + '</span>';
  }
  else if (m.type == "kick") {
    content = '<li class="usermode"><span class="' + cls + '">' + escapeText(m.op) + '</span> kicked <span class="user">' + user + '</span> (' + escapeText(m.msg) + ')';
  }

  $('#' + channelID(channel, network) + ' ul.chat').append(content);

  if (updatenicklist) {
    updateChannelUsers(channel, network);
  }
}
