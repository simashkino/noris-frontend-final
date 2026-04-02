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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [typing, setTyping] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const api = axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  useEffect(() => {
    if (token) fetchUser();
  }, [token]);

  useEffect(() => {
    if (socket && activeChat) socket.emit('join_chat', activeChat.id);
  }, [socket, activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchUser = async () => {
    try {
      const { data } = await api.get('/users/me');
      setUser(data.user);
      initSocket();
      loadChats();
      loadContacts();
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
      if (msg.senderId !== user?.id) toast('📩 Новое сообщение');
    });
    newSocket.on('user_typing', ({ chatId }) => {
      if (activeChat?.id === chatId) setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    });
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

  const loadMessages = async (chatId) => {
    try {
      const { data } = await api.get(`/messages/${chatId}`);
      setMessages(data);
    } catch (e) {}
  };

  const sendMessage = async (content) => {
    if (!content || !socket || !activeChat) return;
    socket.emit('send_message', {
      chatId: activeChat.id,
      content,
      type: 'text',
      receiverId: activeChat.type === 'user' ? activeChat.id : null
    });
    setMessageText('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/upload', formData);
    socket.emit('send_message', {
      chatId: activeChat.id,
      content: `📎 ${file.name}: ${data.url}`,
      type: 'file',
      receiverId: activeChat.type === 'user' ? activeChat.id : null,
      fileUrl: data.url,
      fileName: file.name
    });
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

  const openChat = async (chat) => {
    setActiveChat(chat);
    await loadMessages(chat.id);
    if (socket) socket.emit('join_chat', chat.id);
  };

  const handleLogin = async () => {
    try {
      const { data } = await axios.post(API_URL + '/auth/login', { email: authEmail, password: authPassword });
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      initSocket();
      loadChats();
      loadContacts();
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
        <div className="actions">
          <button onClick={() => alert('Группы и каналы будут добавлены в следующем обновлении')}>+ Группа</button>
          <button onClick={() => alert('Стикеры скоро')}>+ Стикерпак</button>
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
                    {msg.type === 'file' ? <a href={msg.fileUrl} target="_blank" rel="noreferrer">📎 {msg.fileName || 'Файл'}</a> : msg.content}
                    <div className="time">{new Date(msg.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="input-area">
              <button className="icon" onClick={() => fileInputRef.current.click()}>📎</button>
              <input ref={fileInputRef} type="file" hidden onChange={handleFileUpload} />
              <input value={messageText} onChange={e => setMessageText(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMessage(messageText)} placeholder="Сообщение" />
              <button className="send" onClick={() => sendMessage(messageText)}>➤</button>
            </div>
          </>
        ) : (
          <div className="empty">✨ Выберите чат, чтобы начать общение</div>
        )}
      </div>
    </div>
  );
}

export default App;ault App;
