import { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Upload, Button, Input, Spin, message, Grid, Drawer, Avatar, ConfigProvider, theme } from 'antd';
import { ArrowUpOutlined, LoadingOutlined, UserOutlined, FileTextOutlined, LogoutOutlined, MenuOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const API_URL = 'http://127.0.0.1:8000';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}
interface DocumentItem {
  id: string;
  filename: string;
}

const AiIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

function App() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  // Сессия
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('username'));

  // Авторизация
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify'>('login');

  // Данные приложения
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  // Состояния загрузки
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Чат
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = () => ({ headers: { 'Authorization': `Bearer ${token}` } });

  useEffect(() => { if (token) fetchDocuments(); }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const saveSession = (tk: string, un: string) => {
    setToken(tk);
    setUsername(un);
    localStorage.setItem('token', tk);
    localStorage.setItem('username', un);
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    setUsername(null);
    setDocuments([]);
    setMessages([]);
    setActiveDocumentId(null);
    setAuthMode('login');
  };

  const handleAuth = async () => {
    if (!loginInput.trim() || !passwordInput.trim()) return message.warning("Заполните все обязательные поля");
    if (authMode === 'register' && !emailInput.trim()) return message.warning("Введите email");

    try {
      if (authMode === 'register') {
        await axios.post(`${API_URL}/users/register`, {
          username: loginInput,
          email: emailInput,
          password: passwordInput
        });
        message.success("Код отправлен на почту!");
        setAuthMode('verify');
      } else {
        const res = await axios.post(`${API_URL}/users/login`, { username: loginInput, password: passwordInput });
        saveSession(res.data.access_token, res.data.username);
      }
    } catch (err: any) {
      if (err.response?.status === 422) {
        message.error("Пароль: мин. 8 символов, 1 буква, 1 цифра");
      } else {
        message.error(err.response?.data?.detail || "Ошибка сервера");
      }
    }
  };

  const handleVerify = async () => {
    if (!codeInput.trim()) return message.warning("Введите код");
    try {
      const res = await axios.post(`${API_URL}/users/verify`, { email: emailInput, code: codeInput });
      saveSession(res.data.access_token, res.data.username);
      message.success("Почта подтверждена!");
    } catch (err: any) {
      message.error(err.response?.data?.detail || "Неверный код");
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_URL}/documents`, authHeaders());
      setDocuments(res.data.documents || []);
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
    }
  };

  const selectDocument = async (docId: string) => {
    setActiveDocumentId(docId);
    setMessages([]);
    setIsLoadingHistory(true);
    if (isMobile) setDrawerVisible(false);
    try {
      const res = await axios.get(`${API_URL}/chat/history/${docId}`, authHeaders());
      setMessages(res.data.messages || []);
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const customUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);
    try {
      const res = await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` }
      });
      await fetchDocuments();
      selectDocument(res.data.document_id);
      onSuccess(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
      onError(err);
    } finally {
      setIsUploading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeDocumentId) return;
    const userText = inputText;
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setInputText('');
    setIsTyping(true);
    try {
      const response = await axios.post(`${API_URL}/chat/ask`, { document_id: activeDocumentId, question: userText }, authHeaders());
      setMessages(prev => [...prev, { role: 'ai', content: response.data.answer }]);
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Сайдбар
  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#09090b', color: '#fafafa' }}>
      <div style={{ padding: '20px 16px' }}>
        <Upload customRequest={customUpload} showUploadList={false}>
          <Button block disabled={isUploading} style={{
            height: 44, background: '#27272a', color: '#fafafa', border: '1px solid #3f3f46',
            borderRadius: 16, fontWeight: 500, fontSize: 15
          }}>
            {isUploading ? <Spin indicator={<LoadingOutlined style={{ color: '#fafafa', marginRight: 8 }} spin />} /> : <PlusOutlined style={{ marginRight: 8 }} />}
            Загрузить PDF
          </Button>
        </Upload>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        <div style={{ fontSize: 13, color: '#a1a1aa', padding: '12px 12px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Чаты
        </div>
        {documents.map(doc => (
          <div key={doc.id} onClick={() => selectDocument(doc.id)} style={{
              padding: '12px 12px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              color: activeDocumentId === doc.id ? '#fafafa' : '#a1a1aa',
              background: activeDocumentId === doc.id ? '#27272a' : 'transparent',
              transition: 'all 0.2s ease', marginBottom: 2, fontSize: 15
            }}>
            <FileTextOutlined style={{ fontSize: 16 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #27272a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar size={36} style={{ background: '#27272a', color: '#fafafa', border: '1px solid #3f3f46' }} icon={<UserOutlined />} />
            <Text style={{ color: '#fafafa', fontWeight: 500, fontSize: 15 }}>{username}</Text>
          </div>
          <Button type="text" icon={<LogoutOutlined style={{ color: '#a1a1aa', fontSize: 16 }} />} onClick={handleLogout} />
        </div>
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: '#09090b', colorTextBase: '#fafafa', colorPrimary: '#fafafa',
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 16, borderRadius: 12,
        },
      }}
    >
      {!token ? (
        // Экран авторизации
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#09090b', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 320 }}>
            <Title level={2} style={{ color: '#fafafa', marginBottom: 30, fontWeight: 600, textAlign: 'center' }}>
              {authMode === 'login' ? "Вход" : authMode === 'register' ? "Регистрация" : "Подтверждение"}
            </Title>

            {authMode === 'verify' ? (
              <>
                <Text style={{ color: '#a1a1aa', display: 'block', marginBottom: 20, textAlign: 'center' }}>
                  Код отправлен на <br/><b>{emailInput}</b>
                </Text>
                <Input
                  size="large" placeholder="000000"
                  value={codeInput} onChange={e => setCodeInput(e.target.value)} onPressEnter={handleVerify}
                  style={{ marginBottom: 24, borderRadius: 16, background: '#18181b', border: '1px solid #27272a', color: 'white', padding: '14px 16px', fontSize: 24, textAlign: 'center', letterSpacing: 10 }}
                  bordered={false} maxLength={6}
                />
                <Button type="primary" block onClick={handleVerify} style={{ borderRadius: 16, height: 50, background: '#27272a', color: '#fafafa', border: '1px solid #3f3f46', fontWeight: 600, fontSize: 16 }}>
                  Подтвердить
                </Button>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <a onClick={() => setAuthMode('register')} style={{ color: '#a1a1aa', fontSize: 15 }}>Изменить данные</a>
                </div>
              </>
            ) : (
              <>
                <Input size="large" placeholder="Имя пользователя" value={loginInput} onChange={e => setLoginInput(e.target.value)} style={{ marginBottom: 12, borderRadius: 16, background: '#18181b', border: '1px solid #27272a', color: 'white', padding: '14px 16px', fontSize: 16 }} bordered={false} />

                {authMode === 'register' && (
                  <Input size="large" placeholder="Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ marginBottom: 12, borderRadius: 16, background: '#18181b', border: '1px solid #27272a', color: 'white', padding: '14px 16px', fontSize: 16 }} bordered={false} />
                )}

                <Input.Password size="large" placeholder="Пароль" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} onPressEnter={handleAuth} style={{ marginBottom: 24, borderRadius: 16, background: '#18181b', border: '1px solid #27272a', padding: '14px 16px', fontSize: 16 }} bordered={false} />

                <Button type="primary" block onClick={handleAuth} style={{ borderRadius: 16, height: 50, background: '#27272a', color: '#fafafa', border: '1px solid #3f3f46', fontWeight: 600, fontSize: 16 }}>
                  {authMode === 'login' ? "Войти" : "Продолжить"}
                </Button>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <a onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ color: '#a1a1aa', fontSize: 15 }}>
                    {authMode === 'login' ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Войти"}
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        // Главный интерфейс чата
        <Layout style={{ height: '100dvh', overflow: 'hidden', background: '#18181b' }}>
          {isMobile ? (
            <Drawer placement="left" onClose={() => setDrawerVisible(false)} open={drawerVisible} bodyStyle={{ padding: 0 }} width={280} closeIcon={null}>
              {sidebarContent}
            </Drawer>
          ) : (
            <Sider width={280} style={{ borderRight: '1px solid #27272a' }}>{sidebarContent}</Sider>
          )}

          <Layout style={{ background: '#18181b' }}>
            {isMobile && (
              <Header style={{ padding: '0 16px', display: 'flex', alignItems: 'center', height: 60, background: '#18181b', borderBottom: '1px solid #27272a' }}>
                <Button type="text" icon={<MenuOutlined style={{ color: '#fafafa', fontSize: 18 }}/>} onClick={() => setDrawerVisible(true)} style={{ padding: 0, marginRight: 16 }} />
                <Text style={{ color: '#fafafa', fontWeight: 500, fontSize: 17 }}>RAG Assistant</Text>
              </Header>
            )}

            <Content style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100dvh - 60px)' : '100dvh', position: 'relative' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '40px 0', scrollBehavior: 'smooth' }}>
                {isLoadingHistory ? (
                  <div style={{ textAlign: 'center', marginTop: '30vh' }}><Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: '#a1a1aa' }} spin />} /></div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a1a1aa' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 20, border: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                       <AiIcon />
                    </div>
                    <Title level={3} style={{ color: '#fafafa', margin: 0, fontWeight: 500 }}>Чем могу помочь?</Title>
                    <Text style={{ color: '#a1a1aa', marginTop: 12, fontSize: 16 }}>{activeDocumentId ? "Документ загружен и готов." : "Загрузите PDF в левом меню."}</Text>
                  </div>
                ) : (
                  <div style={{ maxWidth: 800, margin: '0 auto', padding: isMobile ? '0' : '0 20px', display: 'flex', flexDirection: 'column', paddingBottom: 110 }}>
                    {messages.map((msg, idx) => (
                      <div key={idx} style={{
                        display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 36, width: '100%'
                      }}>
                        {msg.role === 'ai' && (
                          <div style={{ width: 32, height: 32, borderRadius: 12, border: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 18, marginTop: 4, color: '#fafafa' }}>
                            <AiIcon />
                          </div>
                        )}
                        <div style={{
                          background: msg.role === 'user' ? '#27272a' : 'transparent',
                          color: '#fafafa', padding: msg.role === 'user' ? '12px 20px' : '6px 0',
                          borderRadius: 24, borderBottomRightRadius: msg.role === 'user' ? 6 : 24,
                          maxWidth: msg.role === 'user' ? '75%' : '85%', fontSize: 16, lineHeight: 1.75,
                          whiteSpace: 'pre-wrap', fontWeight: 400, letterSpacing: '0.2px'
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 36, width: '100%' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 12, border: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 18, marginTop: 4, color: '#fafafa' }}>
                            <AiIcon />
                        </div>
                        <div style={{ padding: '6px 0', color: '#a1a1aa', display: 'flex', alignItems: 'center' }}>
                          <Spin indicator={<LoadingOutlined style={{ fontSize: 18, color: '#a1a1aa' }} spin />} />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Плавающее поле ввода */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: isMobile ? '12px' : '24px', background: 'linear-gradient(180deg, rgba(24,24,27,0) 0%, rgba(24,24,27,0.9) 20%, rgba(24,24,27,1) 100%)', pointerEvents: 'none' }}>
                <div style={{ maxWidth: 800, margin: '0 auto', pointerEvents: 'auto' }}>
                  <div style={{ background: '#27272a', borderRadius: 32, border: '1px solid #3f3f46', display: 'flex', alignItems: 'flex-end', padding: '10px 14px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
                    <Input.TextArea
                      value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder={activeDocumentId ? "Напишите сообщение..." : "Выберите чат"}
                      disabled={!activeDocumentId || isUploading || isTyping} autoSize={{ minRows: 1, maxRows: 8 }} bordered={false}
                      style={{ color: '#fafafa', fontSize: 16, lineHeight: 1.6, padding: '8px 10px', resize: 'none', boxShadow: 'none' }}
                    />
                    <Button
                      type="primary" shape="circle" disabled={!activeDocumentId || !inputText.trim()} onClick={sendMessage} loading={isTyping}
                      style={{
                        background: inputText.trim() ? '#fafafa' : '#3f3f46', color: inputText.trim() ? '#09090b' : '#a1a1aa',
                        border: 'none', width: 36, height: 36, flexShrink: 0, marginBottom: 4, marginLeft: 10, display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      icon={<ArrowUpOutlined style={{ fontSize: 18 }} />}
                    />
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <Text style={{ fontSize: 13, color: '#71717a' }}>Локальная нейросеть может ошибаться. Проверяйте факты.</Text>
                  </div>
                </div>
              </div>
            </Content>
          </Layout>
        </Layout>
      )}
    </ConfigProvider>
  );
}

export default App;