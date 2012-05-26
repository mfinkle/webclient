/*
  * Copyright (C) 2004-2011  See the AUTHORS file for details.
  *
  * This program is free software; you can redistribute it and/or modify it
  * under the terms of the GNU General Public License version 2 as published
  * by the Free Software Foundation.
  */

#include "Chan.h"
#include "HTTPSock.h"
#include "Server.h"
#include "Template.h"
#include "User.h"
#include "znc.h"
#include "WebModules.h"
#include <list>
#include <map>
#include <sstream>
#include <vector>

using std::list;
using std::map;
using std::stringstream;
using std::vector;

class CWebClientMod;

class CEventSock : public CSocket {
public:
  CEventSock(CWebClientMod* pModule);
  ~CEventSock() { Cleanup(); }
  virtual void Disconnected() {
    DEBUG("CEventSock closed");
    Cleanup();
  }

private:
  void Cleanup();

  CWebClientMod* m_pModule;
};

static CString ChanList(const vector<CChan*>& vChans) {
  CString s;
  for (unsigned int i = 0; i < vChans.size(); i++) {
    s += vChans[i]->GetName();
    if (i != vChans.size() - 1)
      s += ",";
  }
  return s;
}

static CString NickList(const map<CString,CNick>& nicks) {
  CString nicklist = "";
  size_t size = nicks.size() - 1;
  for (map<CString,CNick>::const_iterator it = nicks.begin();
       it != nicks.end();
       it++, size--) {
    nicklist += it->first;
    if (size != 0)
      nicklist += ",";
  }
  return nicklist;
}

const unsigned int kMaxEventQueue = 500;

class CWebClientMod : public CModule {
private:
  typedef map<CString,CString> EventMap;
  vector<CEventSock*> m_sockets;

  // Save a buffer of events in case a client gets disconnected, and also
  // for scrollback.
  //TODO: figure out how to save unlimited scrollback...
  unsigned int m_nextID;
  typedef list<pair<unsigned int, string> > EventList;
  EventList m_events;

  void SendEvent(const CString& event, const EventMap& data) {
    stringstream s;
    s << "event: " << event << "\n"
      << "id: " << m_nextID << "\n"
      << "data: {";
    // Horrible JSON serialization
    for (EventMap::const_iterator it = data.begin(); it != data.end(); it++) {
      s << "\"" << it->first.Replace_n("\"", "\\\"") << "\": \""<< it->second.Replace_n("\"", "\\\"") << "\", ";
    }
    s << "\"timestamp\": " << time(NULL) << ", ";
    s << "\"id\": \"" << m_nextID << "\"";
    s << "}\n\n";

    m_events.push_back(make_pair(m_nextID, s.str()));
    m_nextID++;

    while (m_events.size() > kMaxEventQueue) {
      m_events.pop_front();
    }

    for (unsigned int i=0; i<m_sockets.size(); i++) {
      m_sockets[i]->Write(s.str());
    }
  }

public:
  MODCONSTRUCTOR(CWebClientMod) {
    m_nextID = 1;
    AddHelpCommand();
  }

  virtual ~CWebClientMod() {}

  virtual CString GetWebMenuTitle() { return "WebClient"; }

  virtual EModRet OnRaw(CString& sLine) {
    CString cmd = sLine.Token(1);
    if (cmd == "366") {
      CChan* pChan = m_pUser->FindChan(sLine.Token(3));
      if (pChan) {
        EventMap m;
        m["network"] = m_pUser->GetCurrentServer()->GetName();
        m["channel"] = pChan->GetName();
        const map<CString,CNick>& nicks = pChan->GetNicks();
        m["nicks"] = NickList(nicks);
        SendEvent("names", m);
      }
    }
    return CONTINUE;
  }

  virtual void OnOp(const CNick& OpNick, const CNick& Nick, CChan& Channel, bool bNoChange) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["op"] = OpNick.GetNick();
    m["user"] = Nick.GetNick();
    m["opped"] = "true";
    m["channel"] = Channel.GetName();
    SendEvent("op", m);
  }

  virtual void OnDeop(const CNick& OpNick, const CNick& Nick, CChan& Channel, bool bNoChange) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["op"] = OpNick.GetNick();
    m["user"] = Nick.GetNick();
    m["opped"] = "false";
    m["channel"] = Channel.GetName();
    SendEvent("op", m);
  }

  virtual void OnVoice(const CNick& OpNick, const CNick& Nick, CChan& Channel, bool bNoChange) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["op"] = OpNick.GetNick();
    m["user"] = Nick.GetNick();
    m["voiced"] = "true";
    m["channel"] = Channel.GetName();
    SendEvent("voice", m);
  }

  virtual void OnDevoice(const CNick& OpNick, const CNick& Nick, CChan& Channel, bool bNoChange) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["op"] = OpNick.GetNick();
    m["user"] = Nick.GetNick();
    m["voiced"] = "false";
    m["channel"] = Channel.GetName();
    SendEvent("voice", m);
  }

  virtual void OnKick(const CNick& OpNick, const CString& sKickedNick, CChan& Channel, const CString& sMessage) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["op"] = OpNick.GetNick();
    m["user"] = sKickedNick;
    m["channel"] = Channel.GetName();
    m["msg"] = sMessage;
    SendEvent("kick", m);
  }

  virtual void OnQuit(const CNick& Nick, const CString& sMessage, const vector<CChan*>& vChans) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["mask"] = Nick.GetNickMask();
    m["channels"] = ChanList(vChans);
    m["msg"] = sMessage;
    SendEvent("quit", m);
  }

  virtual void OnJoin(const CNick& Nick, CChan& Channel) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["mask"] = Nick.GetNickMask();
    m["channel"] = Channel.GetName();
    if (Nick.GetNickMask() == Channel.FindNick(m_pUser->GetCurNick())->GetNickMask()) {
      m["self"] = "true";
      m["topic"] = Channel.GetTopic();
    }

    SendEvent("join", m);
  }

  virtual void OnPart(const CNick& Nick, CChan& Channel, const CString& sMessage) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["mask"] = Nick.GetNickMask();
    m["channel"] = Channel.GetName();
    m["msg"] = sMessage;
    if (Nick.GetNickMask() == Channel.FindNick(m_pUser->GetCurNick())->GetNickMask())
      m["self"] = "true";

    SendEvent("part", m);
  }

  virtual void OnNick(const CNick& OldNick, const CString& sNewNick, const vector<CChan*>& vChans) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["old"] = OldNick.GetNick();
    m["new"] = sNewNick;
    m["channels"] = ChanList(vChans);
    SendEvent("nick", m);
  }

  virtual EModRet OnTopic(CNick& Nick, CChan& Channel, CString& sTopic) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["channel"] = Channel.GetName();
    m["topic"] = sTopic;
    SendEvent("topic", m);
    return CONTINUE;
  }

  virtual EModRet OnUserTopic(CString& sTarget, CString& sTopic) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = m_pUser->GetCurNick();
    m["self"] = "true";
    m["channel"] = sTarget;
    m["topic"] = sTopic;
    SendEvent("topic", m);
    return CONTINUE;
  }

  void SendMsgEvent(CServer& Server, const CString& sTarget, const CString& sMessage, bool action) {
    EventMap m;
    m["network"] = Server.GetName();
    m["msg"] = sMessage;
    m["self"] = "true";
    if (action)
      m["action"] = "true";

    if (m_pUser->IsChan(sTarget)) {
      m["channel"] = sTarget;
      m["user"] = m_pUser->GetCurNick();
      SendEvent("chanmsg", m);
    } else {
      m["user"] = sTarget;
      SendEvent("privmsg", m);
    }
  }

  virtual EModRet OnUserMsg(CString& sTarget, CString& sMessage) {
    CServer* pServer = m_pUser->GetCurrentServer();
    SendMsgEvent(*pServer, sTarget, sMessage, false);
    return CONTINUE;
  }

  virtual EModRet OnUserAction(CString& sTarget, CString& sMessage) {
    CServer* pServer = m_pUser->GetCurrentServer();
    SendMsgEvent(*pServer, sTarget, sMessage, true);
    return CONTINUE;
  }

  virtual EModRet OnPrivMsg(CNick& Nick, CString& sMessage) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["mask"] = Nick.GetNickMask();
    m["msg"] = sMessage;
    SendEvent("privmsg", m);
    return CONTINUE;
  }

  virtual EModRet OnPrivAction(CNick& Nick, CString& sMessage) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["mask"] = Nick.GetNickMask();
    m["action"] = "true";
    m["msg"] = sMessage;
    SendEvent("privmsg", m);
    return CONTINUE;
  }

  virtual EModRet OnChanMsg(CNick& Nick, CChan& Channel, CString& sMessage) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["channel"] = Channel.GetName();
    m["msg"] = sMessage;
    SendEvent("chanmsg", m);
    return CONTINUE;
  }

  virtual EModRet OnChanAction(CNick& Nick, CChan& Channel, CString& sMessage) {
    EventMap m;
    m["network"] = m_pUser->GetCurrentServer()->GetName();
    m["user"] = Nick.GetNick();
    m["action"] = "true";
    m["channel"] = Channel.GetName();
    m["msg"] = sMessage;
    SendEvent("chanmsg", m);
    return CONTINUE;
  }

  void RemoveSocket(CEventSock* sock) {
    for (unsigned int i = 0; i < m_sockets.size(); i++) {
      if (m_sockets[i] == sock) {
        m_sockets.erase(m_sockets.begin() + i);
        break;
      }
    }
  }

  void EventStreamRequest(CWebSock& WebSock) {
    WebSock.AddHeader("Cache-Control", "no-cache");
    WebSock.PrintHeader(0, "text/event-stream");

    CString lastIDHeader = WebSock.GetRequestCookie("Last-Event-ID");
    unsigned int lastID = 0;
    if (!lastIDHeader.empty())
      lastID = lastIDHeader.ToUInt();

    // See if we have any buffered events.
    if (!m_events.empty() && m_events.back().first >= lastID) {
      for (EventList::const_iterator it = m_events.begin(); it != m_events.end(); it++) {
        if (it->first <= lastID)
          continue;
        DEBUG("Sending queued event " << it->first << ": " << it->second);
        WebSock.Write(it->second);
      }
    } else {
      if (m_events.empty()) {
        DEBUG("Event queue empty");
      } else if (m_events.back().first > lastID) {
        DEBUG("No pending events: " << m_events.back().first << " > " << lastID);
      }
    }

    CEventSock* sock = new CEventSock(this);
    sock->SetTimeout(5);
    CZNC::Get().GetManager().SwapSockByAddr(sock, &WebSock);
    sock->SetSockName("WebClient::Events");
    m_sockets.push_back(sock);
  }

  void SendPrivMsg(CServer& Server, CChan& Channel, CString& msg, bool action) {
    SendMsgEvent(Server, Channel.GetName(), msg, action);

    if (action)
      msg = "\001ACTION " + msg + "\001";
    PutIRC("PRIVMSG " + Channel.GetName() + " :" + msg);

    // Relay to the rest of the clients that may be connected to this user
    vector<CClient*> vClients = m_pUser->GetClients();
    for (unsigned int a = 0; a < vClients.size(); a++) {
      CClient* pClient = vClients[a];
      pClient->PutClient(":" + pClient->GetNickMask() + " PRIVMSG " + Channel.GetName() + " :" + msg);
    }
  }

  bool ChanmsgRequest(CWebSock& WebSock, CString& network, CString& channel) {
    DEBUG("ChanmsgRequest: " << network << ", " << channel);
    CServer* Server = m_pUser->FindServer(network);
    if (!Server)
      return false;

    CChan* Channel = m_pUser->FindChan(channel);
    if (!Channel)
      return false;

    CString msg = WebSock.GetParam("msg");
    CString action = WebSock.GetParam("action");
    SendPrivMsg(*Server, *Channel, msg, action == "true");

    return true;
  }

  virtual bool OnWebPreRequest(CWebSock& WebSock, const CString& sPageName) {
    DEBUG("OnWebPreRequest: " << sPageName);
    VCString parts;
    if (sPageName.Split("/", parts) == 0)
      return false;

    if (parts[0] == "events") {
      EventStreamRequest(WebSock);
      return true;
    }
    if (parts[0] == "chanmsg") {
      if (parts.size() != 3)
        return false;

      //TODO: need a real decodeURIComponent
      parts[2].Replace("%23", "#");
      return ChanmsgRequest(WebSock, parts[1], parts[2]);
    }

    return false;
  }

  virtual bool OnWebRequest(CWebSock& WebSock, const CString& sPageName, CTemplate& Tmpl) {
    if (sPageName == "index") {
      //TODO: send existing user info/channel etc
      CUser* user = GetUser();
      const vector<CServer*>& servers = user->GetServers();
      for (unsigned int i = 0; i < servers.size(); i++) {
        CTemplate& n = Tmpl.AddRow("NetworkLoop");
        n["Network"] = servers[i]->GetName();
        n["Nick"] = user->GetCurNick();

        const vector<CChan*>& channels = user->GetChans();
        for (unsigned int j = 0; j < channels.size(); j++) {
          CTemplate& c = n.AddRow("ChannelLoop");
          c["Channel"] = channels[j]->GetName();
          c["Topic"] = channels[j]->GetTopic();
          const map<CString,CNick>& nicks = channels[j]->GetNicks();
          c["Nicks"] = NickList(nicks);
        }
      }
      return true;
    }
    return false;
  }
};

CEventSock::CEventSock(CWebClientMod* pModule) : CSocket(pModule),
  m_pModule(pModule) {}

void CEventSock::Cleanup() {
  if (m_pModule) {
    m_pModule->RemoveSocket(this);
    m_pModule = NULL;
  }
}

MODULEDEFS(CWebClientMod, "Chat via a web browser")
