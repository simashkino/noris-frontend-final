import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL + '/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [chats, setChats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [channels, setChannels] = useState([]);
  const [stickerPacks, setStickerPacks] = useState([]);
  const [showStickers, setShowStickers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const api = axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      showLogin();
    }
  }, [token]);

  useEffect(() => {
    if (socket && activeChat) {
      socket.emit('join_chat', activeChat.id);
    }
  }, [socket, activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchUser = async () => {
    try {
      const { data } = await api.get('/users/me');
      setUser(data.user);
      initSocket();
      loadData();
    } catch {
      localStorage.removeItem('token');
      setToken(null);
      showLogin();
    }
  };

  const initSocket = () => {
    const newSocket = io(process.env.REACT_APP_API_URL, { auth: { token } });
    setSocket(newSocket);
    newSocket.on('new_message', (msg) => {
      if (activeChat && (msg.chatId === activeChat.id || msg.senderId === activeChat.id)) {
        setMessages(prev => [...prev, msg]);
      }
      loadChats();
      if (msg.senderId !== user?.id) {
        toast(`📩 Новое сообщение от ${msg.senderId}`);
      }
    });
    newSocket.on('user_typing', ({ userId, chatId }) => {
      if (activeChat?.id === chatId || activeChat?.id === userId) setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    });
  };

  const loadData = async () => {
    await Promise.all([loadContacts(), loadChats(), loadGroups(), loadChannels(), loadStickerPacks()]);
  };

  const loadContacts = async () => {
    const { data } = await api.get('/users/contacts');
    setContacts(data);
  };

  const loadChats = async () => {
    const { data } = await api.get('/chats');
    setChats(data);
  };

  const loadGroups = async () => {
    const { data } = await api.get('/groups');
    setGroups(data);
  };

  const loadChannels = async () => {
    const { data } = await api.get('/channels');
    setChannels(data);
  };

  const loadStickerPacks = async () => {
    const { data } = await api.get('/sticker-packs');
    setStickerPacks(data);
  };

  const loadMessages = async (chatId) => {
    const { data } = await api.get(`/messages/${chatId}`);
    setMessages(data);
  };

  const sendMessage = async (content, type = 'text', fileUrl = null, fileName = null, isSticker = false) => {
    if (!content && !fileUrl) return;
    socket.emit('send_message', {
      chatId: activeChat.id,
      content: content || (fileUrl ? (isSticker ? '🎨 Стикер' : `📎 ${fileName}`) : ''),
      type,
      receiverId: activeChat.type === 'user' ? activeChat.id : null,
      fileUrl,
      fileName,
      isSticker
    });
    setMessageText('');
  };

  const handleFileUpload = async (e, type = 'file') => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/upload', formData);
    sendMessage(data.url, type, data.url, file.name);
  };

  // Голосовые сообщения (кружок)
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, 'voice.webm');
        const { data } = await api.post('/upload', formData);
        sendMessage(data.url, 'voice', data.url, 'Голосовое');
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setRecording(true);
      toast('🎙 Запись... Отпустите для отправки');
    } catch { toast('Нет доступа к микрофону', { icon: '❌' }); }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Видеосообщения (кружок)
  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
      const mediaRecorder = new MediaRecorder(stream);
      videoRecorderRef.current = mediaRecorder;
      const chunks = [];
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/mp4' });
        const formData = new FormData();
        formData.append('file', blob, 'video.mp4');
        const { data } = await api.post('/upload', formData);
        sendMessage(data.url, 'video', data.url, 'Видео');
        stream.getTracks().forEach(track => track.stop());
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
      };
      mediaRecorder.start();
      setVideoRecording(true);
      toast('🎥 Запись видео... Отпустите для отправки');
    } catch { toast('Нет доступа к камере', { icon: '❌' }); }
  };

  const stopVideoRecording = () => {
    if (videoRecorderRef.current && videoRecording) {
      videoRecorderRef.current.stop();
      setVideoRecording(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery) return;
    const { data } = await api.get(`/users/search?q=${searchQuery}`);
    setSearchResults(data);
  };

  const addContact = async (contactId) => {
    await api.post('/users/contact', { contactId });
    toast.success('Контакт добавлен');
    loadContacts();
    loadChats();
  };

  const createGroup = async () => {
    const name = prompt('Название группы:');
    if (!name) return;
    const { data } = await api.post('/groups', { name });
    toast.success('Группа создана');
    loadChats();
    openChat({ id: data.id, name, type: 'group' });
  };

  const createChannel = async () => {
    const name = prompt('Название канала:');
    const username = prompt('Уникальный username канала (латиница):');
    if (!name || !username) return;
    const { data } = await api.post('/channels', { name, username, isPublic: true });
    toast.success('Канал создан');
    loadChats();
  };

  const joinChannel = async (channelId) => {
    await api.post(`/channels/${channelId}/join`);
    toast.success('Вы подписались');
    loadChats();
  };

  const createStickerPack = async () => {
    const name = prompt('Название стикерпака:');
    if (!name) return;
    const { data } = await api.post('/sticker-packs', { name });
    toast.success('Стикерпак создан');
    loadStickerPacks();
  };

  const addStickerToPack = async (packId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('sticker', file);
      await api.post(`/sticker-packs/${packId}/add-sticker`, formData);
      toast.success('Стикер добавлен');
      loadStickerPacks();
    };
    input.click();
  };

  const addStickerPack = async (inviteLink) => {
    await api.post(`/sticker-packs/${inviteLink}/add`);
    toast.success('Стикерпак добавлен');
    loadStickerPacks();
  };

  const openChat = async (chat) => {
    setActiveChat(chat);
    await loadMessages(chat.id);
    if (socket) socket.emit('join_chat', chat.id);
    setShowStickers(false);
  };

  const renderMessage = (msg) => {
    if (msg.type === 'voice') return <audio controls src={msg.fileUrl} style={{ maxWidth: '200px' }} />;
    if (msg.type === 'video') return <video controls src={msg.fileUrl} style={{ maxWidth: '250px', borderRadius: '12px' }} />;
    if (msg.type === 'file') return <a href={msg.fileUrl} target="_blank" rel="noreferrer">📎 {msg.fileName || 'Файл'}</a>;
    if (msg.isSticker) return <img src={msg.fileUrl} alt="sticker" style={{ maxWidth: '120px', maxHeight: '120px' }} />;
    return msg.content;
  };

  const showLogin = () => {
    // Простая форма входа/регистрации
    document.body.innerHTML = '<div id="root" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#f9f6ff"><div class="auth-card"><h1>✨ Noris</h1><input id="email" placeholder="Email"/><input id="password" type="password" placeholder="Пароль"/><button onclick="window.login()">Войти</button><button onclick="window.showRegister()">Создать аккаунт</button></div></div>';
    window.login = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const { data } = await axios.post(API_URL + '/auth/login', { email, password });
      if (data.token) {
        localStorage.setItem('token', data.token);
        window.location.reload();
      } else alert('Ошибка');
    };
    window.showRegister = () => {
      document.getElementById('root').innerHTML = '<div class="auth-card"><h1>Регистрация</h1><input id="regEmail" placeholder="Email"/><input id="regPassword" type="password" placeholder="Пароль"/><input id="regFirstName" placeholder="Имя"/><input id="regLastName" placeholder="Фамилия"/><input id="regUsername" placeholder="Никнейм"/><button onclick="window.register()">Зарегистрироваться</button><button onclick="window.showLogin()">Назад</button></div>';
    };
    window.register = async () => {
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const firstName = document.getElementById('regFirstName').value;
      const lastName = document.getElementById('regLastName').value;
      const username = document.getElementById('regUsername').value;
      await axios.post(API_URL + '/auth/register', { email, password, firstName, lastName, username });
      alert('Аккаунт зарегистрирован! Теперь войдите.');
      showLogin();
    };
  };

  if (!user) return <div className="loading">Загрузка Noris...</div>;

  return (
    <div className="app">
      <Toaster position="top-right" />
      <div className="sidebar">
        <div className="profile">
          <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}&background=9b59b6&color=fff`} alt="" />
          <div><strong>{user.firstName} {user.lastName}</strong><br/>@{user.username}</div>
          <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}>🚪</button>
        </div>
        <div className="search-section">
          <div className="search-box">
            <input placeholder="Поиск по никнейму" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button onClick={searchUsers}>🔍</button>
          </div>
          {searchResults.map(u => (
            <div key={u.id} className="search-result" onClick={() => addContact(u.id)}>@{u.username} — {u.firstName} {u.lastName} +</div>
          ))}
        </div>
        <div className="section">📞 КОНТАКТЫ</div>
        {contacts.map(c => (
          <div key={c.id} className="chat-item" onClick={() => openChat({ id: c.id, name: c.username, type: 'user' })}>
            <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.username}&background=9b59b6&color=fff`} alt="" />
            <span>{c.firstName} {c.lastName}</span>
            <span className={`status ${c.isOnline ? 'online' : 'offline'}`}></span>
          </div>
        ))}
        <div className="section">💬 ЧАТЫ</div>
        {chats.map(chat => (
          <div key={chat.id} className="chat-item" onClick={() => openChat(chat)}>
            <img src={chat.avatar || `https://ui-avatars.com/api/?name=${chat.name}&background=9b59b6&color=fff`} alt="" />
            <span>{chat.name}</span>
          </div>
        ))}
        <div className="section">👥 ГРУППЫ</div>
        {groups.map(g => (
          <div key={g.id} className="chat-item" onClick={() => openChat({ id: g.id, name: g.name, type: 'group' })}>👥 {g.name}</div>
        ))}
        <div className="section">📢 КАНАЛЫ</div>
        {channels.map(c => (
          <div key={c.id} className="chat-item" onClick={() => openChat({ id: c.id, name: c.name, type: 'channel' })}>📢 {c.name}</div>
        ))}
        <div className="actions">
          <button onClick={createGroup}>+ Группа</button>
          <button onClick={createChannel}>+ Канал</button>
          <button onClick={createStickerPack}>+ Стикерпак</button>
        </div>
      </div>

      <div className="chat-area">
        {activeChat ? (
          <>
            <div className="chat-header">
              <span>{activeChat.name}</span>
              {typing && <small className="typing">печатает...</small>}
            </div>
            <div className="messages">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.senderId === user.id ? 'mine' : 'theirs'}`}>
                  <div className="bubble">
                    {renderMessage(msg)}
                    <div className="time">{new Date(msg.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="input-area">
              <button className="icon" onClick={() => fileInputRef.current.click()}>📎</button>
              <input ref={fileInputRef} type="file" hidden onChange={handleFileUpload} />
              <button className="icon" onMouseDown={startVoiceRecording} onMouseUp={stopVoiceRecording} onTouchStart={startVoiceRecording} onTouchEnd={stopVoiceRecording}>🎙</button>
              <button className="icon" onMouseDown={startVideoRecording} onMouseUp={stopVideoRecording} onTouchStart={startVideoRecording} onTouchEnd={stopVideoRecording}>📹</button>
              <button className="icon" onClick={() => setShowStickers(!showStickers)}>😊</button>
              <input value={messageText} onChange={e => setMessageText(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMessage(messageText)} placeholder="Сообщение" />
              <button className="send" onClick={() => sendMessage(messageText)}>➤</button>
            </div>
            {showStickers && (
              <div className="sticker-panel">
                {stickerPacks.map(pack => (
                  <div key={pack.id} className="sticker-pack">
                    <div className="pack-name">{pack.name} {pack.coverSticker && <img src={pack.coverSticker} alt="" width="30" />}</div>
                    <button onClick={() => addStickerToPack(pack.id)}>+ Стикер</button>
                  </div>
                ))}
                <button onClick={() => addStickerPack(prompt('Введите ссылку стикерпака:'))}>➕ Добавить стикерпак</button>
              </div>
            )}
          </>
        ) : (
          <div className="empty">✨ Выберите чат, чтобы начать общение</div>
        )}
      </div>
      {videoRecording && <video ref={videoPreviewRef} autoPlay muted style={{ position: 'fixed', bottom: 100, right: 20, width: 120, borderRadius: 60, border: '2px solid #9b59b6' }} />}
    </div>
  );
}

export default App;
