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
  const [authMode, setAuthMode] = useState('login'); // login, register
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authUsername, setAuthUsername] = useState('');

  const mediaRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const api = axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  // Загрузка пользователя
  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token]);

  // Подключение к чату
  useEffect(() => {
    if (socket && activeChat) {
      socket.emit('join_chat', activeChat.id);
    }
  }, [socket, activeChat]);

  // Скролл к последнему сообщению
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
        toast(`📩 Новое сообщение`);
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
    try {
      const { data } = await api.get('/users/contacts');
      setContacts(data);
    } catch (e) {}
  };

  const loadChats = async () => {
    try {
      const { data } = await api.get('/chats');
      setChats(data);
    } catch (e) {}
  };

  const loadGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (e) {}
  };

  const loadChannels = async () => {
    try {
      const { data } = await api.get('/channels');
      setChannels(data);
    } catch (e) {}
  };

  const loadStickerPacks = async () => {
    try {
      const { data } = await api.get('/sticker-packs');
      setStickerPacks(data);
    } catch (e) {}
  };

  const loadMessages = async (chatId) => {
    try {
      const { data } = await api.get(`/messages/${chatId}`);
      setMessages(data);
    } catch (e) {}
  };

  const sendMessage = async (content, type = 'text', fileUrl = null, fileName = null, isSticker = false) => {
    if (!content && !fileUrl) return;
    if (!socket || !activeChat) return;
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
    try {
      const { data } = await api.post('/upload', formData);
      sendMessage(data.url, type, data.url, file.name);
    } catch (err) {
      toast.error('Ошибка загрузки');
    }
  };

  // Голосовые сообщения
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
    } catch {
      toast.error('Нет доступа к микрофону');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Видеосообщения
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
    } catch {
      toast.error('Нет доступа к камере');
    }
  };

  const stopVideoRecording = () => {
    if (videoRecorderRef.current && videoRecording) {
      videoRecorderRef.current.stop();
      setVideoRecording(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery) return;
    try {
      const { data } = await api.get(`/users/search?q=${searchQuery}`);
      setSearchResults(data);
    } catch (e) {}
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

  const handleLogin = async () => {
    try {
      const { data } = await axios.post(API_URL + '/auth/login', { email: authEmail, password: authPassword });
      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        initSocket();
        loadData();
      }
    } catch {
      toast.error('Ошибка входа');
    }
  };

  const handleRegister = async () => {
    try {
      await axios.post(API_URL + '/auth/register', {
        email: authEmail,
        password: authPassword,
        firstName: authFirstName,
        lastName: authLastName,
        username: authUsername
      });
      toast.success('Аккаунт зарегистрирован! Теперь войдите.');
      setAuthMode('login');
    } catch {
      toast.error('Ошибка регистрации');
    }
  };

  const renderMessage = (msg) => {
    if (msg.type === 'voice') return <audio controls src={msg.fileUrl} style={{ maxWidth: '200px' }} />;
    if (msg.type === 'video') return <video controls src={msg.fileUrl} style={{ maxWidth: '250px', borderRadius: '12px' }} />;
    if (msg.type === 'file') return <a href={msg.fileUrl} target="_blank" rel="noreferrer">📎 {msg.fileName || 'Файл'}</a>;
    if (msg.isSticker) return <img src={msg.fileUrl} alt="sticker" style={{ maxWidth: '120px', maxHeight: '120px' }} />;
    return msg.content;
  };

  // Экран авторизации
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>✨ Noris</h1>
          {authMode === 'login' ? (
            <>
              <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              <input type="password" placeholder="Пароль" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
              <button onClick={handleLogin}>Войти</button>
              <button className="secondary" onClick={() => setAuthMode('register')}>Создать аккаунт</button>
            </>
          ) : (
            <>
              <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              <input type="password" placeholder="Пароль" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
              <input type="text" placeholder="Имя" value={authFirstName} onChange={e => setAuthFirstName(e.target.value)} />
              <input type="text" placeholder="Фамилия" value={authLastName} onChange={e => setAuthLastName(e.target.value)} />
              <input type="text" placeholder="Никнейм (латиница)" value={authUsername} onChange={e => setAuthUsername(e.target.value)} />
              <button onClick={handleRegister}>Зарегистрироваться</button>
              <button className="secondary" onClick={() => setAuthMode('login')}>Назад</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Основной интерфейс
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
                    <div className="pack-name">{pack.name}</div>
                    <button onClick={() => addStickerToPack(pack.id)}>+ Стикер</button>
                  </div>
                ))}
                <button onClick={() => addStickerPack(prompt('Введите ID стикерпака:'))}>➕ Добавить стикерпак</button>
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
