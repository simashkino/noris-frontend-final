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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [recordingStart, setRecordingStart] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [editProfileMode, setEditProfileMode] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const videoPreviewRef = useRef(null);

  const api = axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  useEffect(() => { if (token) fetchUser(); }, [token]);
  useEffect(() => { if (socket && activeChat) socket.emit('join_chat', activeChat.id); }, [socket, activeChat]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchUser = async () => {
    try {
      const { data } = await api.get('/users/me');
      setUser(data.user);
      setEditFirstName(data.user.firstName);
      setEditLastName(data.user.lastName);
      setEditUsername(data.user.username);
      initSocket();
      loadAll();
    } catch { localStorage.removeItem('token'); setToken(null); }
  };

  const initSocket = () => {
    const newSocket = io(process.env.REACT_APP_API_URL, { auth: { token } });
    setSocket(newSocket);
    newSocket.on('new_message', (msg) => {
      if (activeChat && (msg.chatId === activeChat.id || msg.senderId === activeChat.id)) {
        setMessages(prev => [...prev, msg]);
      }
      loadChats();
      if (msg.senderId !== user?.id) toast('📩 Новое сообщение');
    });
    newSocket.on('user_typing', ({ chatId }) => {
      if (activeChat?.id === chatId) setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    });
  };

  const loadAll = async () => {
    await Promise.all([loadContacts(), loadChats(), loadGroups(), loadChannels(), loadStickerPacks()]);
  };
  const loadContacts = async () => { try { const { data } = await api.get('/users/contacts'); setContacts(data); } catch(e) {} };
  const loadChats = async () => { try { const { data } = await api.get('/chats'); setChats(data); } catch(e) {} };
  const loadGroups = async () => { try { const { data } = await api.get('/groups'); setGroups(data); } catch(e) {} };
  const loadChannels = async () => { try { const { data } = await api.get('/channels'); setChannels(data); } catch(e) {} };
  const loadStickerPacks = async () => { try { const { data } = await api.get('/sticker-packs'); setStickerPacks(data); } catch(e) {} };
  const loadMessages = async (chatId) => { try { const { data } = await api.get(`/messages/${chatId}`); setMessages(data); } catch(e) {} };

  const sendMessage = async (content, type = 'text', fileUrl = null, fileName = null, duration = 0, isSticker = false) => {
    if ((!content && !fileUrl) || !socket || !activeChat) return;
    socket.emit('send_message', {
      chatId: activeChat.id,
      content: content || (fileUrl ? (isSticker ? '🎨 Стикер' : `📎 ${fileName}`) : ''),
      type, receiverId: activeChat.type === 'user' ? activeChat.id : null,
      fileUrl, fileName, duration, isSticker, replyTo: replyTo?.id
    });
    setMessageText('');
    setReplyTo(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/upload', formData);
    sendMessage(data.url, 'file', data.url, file.name);
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const duration = recordingStart ? Math.floor((Date.now() - recordingStart) / 1000) : 0;
        const formData = new FormData();
        formData.append('file', blob, 'voice.webm');
        const { data } = await api.post('/upload', formData);
        sendMessage(data.url, 'voice', data.url, 'Голосовое', duration);
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        setRecordingStart(null);
      };
      mediaRecorder.start();
      setRecording(true);
      setRecordingStart(Date.now());
      toast('🎙 Запись... Отпустите для отправки');
    } catch { toast.error('Нет доступа к микрофону'); }
  };
  const stopVoiceRecording = () => { if (mediaRecorderRef.current && recording) mediaRecorderRef.current.stop(); };

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
        const duration = recordingStart ? Math.floor((Date.now() - recordingStart) / 1000) : 0;
        const formData = new FormData();
        formData.append('file', blob, 'video.mp4');
        const { data } = await api.post('/upload', formData);
        sendMessage(data.url, 'video', data.url, 'Видео', duration);
        stream.getTracks().forEach(track => track.stop());
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
        setVideoRecording(false);
        setRecordingStart(null);
      };
      mediaRecorder.start();
      setVideoRecording(true);
      setRecordingStart(Date.now());
      toast('🎥 Запись видео... Отпустите для отправки');
    } catch { toast.error('Нет доступа к камере'); }
  };
  const stopVideoRecording = () => { if (videoRecorderRef.current && videoRecording) videoRecorderRef.current.stop(); };

  const searchUsers = async () => {
    if (!searchQuery) return;
    const { data } = await api.get(`/users/search?q=${searchQuery}`);
    setSearchResults(data);
  };
  const addContact = async (contactId) => {
    await api.post('/users/contact', { contactId });
    toast.success('Контакт добавлен');
    loadContacts(); loadChats();
    setSearchResults([]); setSearchQuery('');
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };
  const openChat = async (chat) => {
    setActiveChat(chat);
    await loadMessages(chat.id);
    if (socket) socket.emit('join_chat', chat.id);
    if (window.innerWidth <= 768) setSidebarOpen(false);
    setShowStickers(false);
    setReplyTo(null);
  };
  const deleteChat = async (chatId) => {
    await api.post('/deleted-chats', { chatId });
    loadChats();
    if (activeChat?.id === chatId) setActiveChat(null);
    toast.success('Чат удалён');
  };
  const pinChat = async (chatId) => {
    await api.post('/pinned-chats', { chatId });
    loadChats();
    toast.success('Чат закреплён');
  };
  const unpinChat = async (chatId) => {
    await api.delete(`/pinned-chats/${chatId}`);
    loadChats();
    toast.success('Чат откреплён');
  };
  const deleteMessage = async (msgId) => {
    await api.delete(`/messages/${msgId}`);
    loadMessages(activeChat.id);
    toast.success('Сообщение удалено');
  };
  const pinMessage = async (msgId) => {
    await api.post(`/messages/${msgId}/pin`);
    loadMessages(activeChat.id);
    toast.success('Сообщение закреплено');
  };

  const createGroup = async () => {
    const name = prompt('Название группы:');
    if (!name) return;
    const { data } = await api.post('/groups', { name });
    toast.success('Группа создана');
    loadGroups(); loadChats();
    openChat({ id: data.id, name, type: 'group' });
  };
  const addToGroup = async (groupId) => {
    const username = prompt('Username пользователя:');
    if (!username) return;
    const users = await api.get(`/users/search?q=${username}`);
    if (users.data.length) {
      await api.post(`/groups/${groupId}/add`, { userId: users.data[0].id });
      toast.success('Участник добавлен');
    } else toast.error('Пользователь не найден');
  };
  const createChannel = async () => {
    const name = prompt('Название канала:');
    const username = prompt('Уникальный username:');
    if (!name || !username) return;
    const { data } = await api.post('/channels', { name, username });
    toast.success('Канал создан');
    loadChannels(); loadChats();
  };
  const joinChannel = async (channelId) => {
    await api.post(`/channels/${channelId}/join`);
    toast.success('Вы подписались');
    loadChannels(); loadChats();
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
  const sendSticker = (stickerUrl) => {
    sendMessage(stickerUrl, 'sticker', stickerUrl, 'Стикер', 0, true);
    setShowStickers(false);
  };
  const addStickerPack = async () => {
    const link = prompt('Введите ссылку стикерпака:');
    if (link) await api.post(`/sticker-packs/${link}/add`);
    loadStickerPacks();
  };

  const updateProfile = async () => {
    await api.put('/users/profile', { firstName: editFirstName, lastName: editLastName, username: editUsername });
    setUser({ ...user, firstName: editFirstName, lastName: editLastName, username: editUsername });
    toast.success('Профиль обновлён');
    setEditProfileMode(false);
  };
  const updateAvatar = async (e) => {
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('avatar', file);
    const { data } = await api.post('/upload/avatar', formData);
    setUser({ ...user, avatar: data.url });
    toast.success('Аватар обновлён');
  };

  const handleLogin = async () => {
    try {
      const { data } = await axios.post(API_URL + '/auth/login', { email: authEmail, password: authPassword });
      localStorage.setItem('token', data.token);
      setToken(data.token); setUser(data.user);
      initSocket(); loadAll();
    } catch { toast.error('Ошибка входа'); }
  };
  const handleRegister = async () => {
    try {
      await axios.post(API_URL + '/auth/register', { email: authEmail, password: authPassword, firstName: authFirstName, lastName: authLastName, username: authUsername });
      toast.success('Аккаунт зарегистрирован! Теперь войдите.');
      setAuthMode('login');
    } catch { toast.error('Ошибка регистрации'); }
  };
  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null); if (socket) socket.close(); };

  const renderMessage = (msg) => {
    if (msg.type === 'voice') return <audio controls src={msg.fileUrl} style={{ maxWidth: '200px' }} />;
    if (msg.type === 'video') return <video controls src={msg.fileUrl} style={{ maxWidth: '250px', borderRadius: '12px' }} />;
    if (msg.type === 'file') return <a href={msg.fileUrl} target="_blank" rel="noreferrer">📎 {msg.fileName || 'Файл'}</a>;
    if (msg.isSticker) return <img src={msg.fileUrl} alt="sticker" style={{ maxWidth: '120px' }} />;
    return msg.content;
  };

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

  if (editProfileMode) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>✏️ Редактировать</h1>
          <input type="file" accept="image/*" onChange={updateAvatar} />
          <input type="text" placeholder="Имя" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} />
          <input type="text" placeholder="Фамилия" value={editLastName} onChange={e => setEditLastName(e.target.value)} />
          <input type="text" placeholder="Никнейм" value={editUsername} onChange={e => setEditUsername(e.target.value)} />
          <button onClick={updateProfile}>Сохранить</button>
          <button className="secondary" onClick={() => setEditProfileMode(false)}>Отмена</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Toaster position="top-right" />
      {sidebarOpen && <div className="menu-overlay" onClick={() => setSidebarOpen(false)} />}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="profile">
          <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}&background=9b59b6&color=fff`} alt="" />
          <div><strong>{user.firstName} {user.lastName}</strong><br/>@{user.username}</div>
          <button onClick={() => setEditProfileMode(true)}>✏️</button>
          <button onClick={logout}>🚪</button>
        </div>
        <div className="search-section">
          <div className="search-box">
            <input placeholder="Поиск" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && searchUsers()} />
            <button onClick={searchUsers}>🔍</button>
          </div>
          {searchResults.map(u => <div key={u.id} className="search-result" onClick={() => addContact(u.id)}>@{u.username} — {u.firstName} {u.lastName} ➕</div>)}
        </div>
        <div className="section">📞 КОНТАКТЫ</div>
        {contacts.map(c => (
          <div key={c.id} className="contact-item" onClick={() => openChat({ id: c.id, name: c.username, type: 'user' })}>
            <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.username}&background=9b59b6&color=fff`} alt="" />
            <div><strong>{c.firstName} {c.lastName}</strong><br/>@{c.username}</div>
            <span className={`status ${c.isOnline ? 'online' : 'offline'}`}></span>
          </div>
        ))}
        <div className="section">💬 ЧАТЫ</div>
        {chats.map(chat => (
          <div key={chat.id} className="chat-item" onClick={() => openChat(chat)}>
            <img src={chat.avatar || `https://ui-avatars.com/api/?name=${chat.name}&background=9b59b6&color=fff`} alt="" />
            <span>{chat.name}</span>
            <div className="chat-actions">
              <button onClick={(e) => { e.stopPropagation(); pinChat(chat.id); }}>📌</button>
              <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}>🗑️</button>
            </div>
          </div>
        ))}
        <div className="section">👥 ГРУППЫ</div>
        {groups.map(g => <div key={g.id} className="chat-item" onClick={() => openChat({ id: g.id, name: g.name, type: 'group' })}>👥 {g.name}</div>)}
        <button className="action-btn" onClick={createGroup}>+ Группа</button>
        <div className="section">📢 КАНАЛЫ</div>
        {channels.map(c => <div key={c.id} className="chat-item" onClick={() => openChat({ id: c.id, name: c.name, type: 'channel' })}>📢 {c.name}</div>)}
        <button className="action-btn" onClick={createChannel}>+ Канал</button>
        <button className="action-btn" onClick={createStickerPack}>+ Стикерпак</button>
      </div>

      <div className="chat-area">
        <div className="chat-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span>{activeChat ? activeChat.name : 'Noris'}</span>
          {typing && <span className="typing">печатает...</span>}
          {activeChat?.type === 'group' && <button className="header-btn" onClick={() => addToGroup(activeChat.id)}>+ Добавить</button>}
          {activeChat?.type === 'channel' && !channels.find(c => c.id === activeChat.id) && <button className="header-btn" onClick={() => joinChannel(activeChat.id)}>Присоединиться</button>}
        </div>
        {activeChat ? (
          <>
            <div className="messages">
              {replyTo && <div className="reply-bar">Ответ {replyTo.content.substring(0, 30)} <button onClick={() => setReplyTo(null)}>✖</button></div>}
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.senderId === user.id ? 'mine' : 'theirs'}`}>
                  <div className="bubble">
                    {msg.replyTo && <div className="reply-preview">↳ {msg.replyTo}</div>}
                    {renderMessage(msg)}
                    <div className="time">{new Date(msg.createdAt).toLocaleTimeString()}</div>
                    <div className="msg-actions">
                      <button onClick={() => setReplyTo(msg)}>↩️</button>
                      <button onClick={() => pinMessage(msg.id)}>📌</button>
                      <button onClick={() => deleteMessage(msg.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="input-area">
              <button className="icon-btn" onClick={() => fileInputRef.current.click()}>📎</button>
              <input ref={fileInputRef} type="file" hidden onChange={handleFileUpload} />
              <button className={`icon-btn ${recording ? 'recording' : ''}`} onMouseDown={startVoiceRecording} onMouseUp={stopVoiceRecording} onTouchStart={startVoiceRecording} onTouchEnd={stopVoiceRecording}>🎙</button>
              <button className={`icon-btn ${videoRecording ? 'recording' : ''}`} onMouseDown={startVideoRecording} onMouseUp={stopVideoRecording} onTouchStart={startVideoRecording} onTouchEnd={stopVideoRecording}>📹</button>
              <button className="icon-btn" onClick={() => setShowStickers(!showStickers)}>😊</button>
              <input value={messageText} onChange={e => setMessageText(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMessage(messageText)} placeholder="Сообщение" />
              <button className="send-btn" onClick={() => sendMessage(messageText)}>➤</button>
            </div>
            {showStickers && (
              <div className="sticker-panel">
                {stickerPacks.map(pack => (
                  <div key={pack.id} className="sticker-pack">
                    <div className="pack-name">{pack.name}</div>
                    <div className="sticker-list">
                      {pack.stickers?.map(s => <img key={s.id} src={s.imageUrl} onClick={() => sendSticker(s.imageUrl)} alt="sticker" />)}
                    </div>
                    <button onClick={() => addStickerToPack(pack.id)}>+ Стикер</button>
                  </div>
                ))}
                <button onClick={addStickerPack}>➕ Добавить стикерпак</button>
              </div>
            )}
          </>
        ) : <div className="empty">✨ Noris<br/>Нажмите ☰, чтобы начать</div>}
      </div>
      {videoRecording && <video ref={videoPreviewRef} autoPlay muted className="video-preview" />}
    </div>
  );
}

export default App;
