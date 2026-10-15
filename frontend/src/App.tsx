import { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Upload, Button, Input, Spin, message, Grid, Drawer, Avatar, ConfigProvider, theme, Progress, Popconfirm } from 'antd';
import {
  ArrowUpOutlined, LoadingOutlined, UserOutlined, FileTextOutlined,
  LogoutOutlined, MenuOutlined, PlusOutlined, SyncOutlined,
  CheckCircleOutlined, SunOutlined, MoonOutlined, DeleteOutlined
} from '@ant-design/icons';
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

function App() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  // Тема (Светлая / Темная)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== 'light'; // По умолчанию темная
  });

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting' | 'processing' | 'success' | 'error'>('idle');

  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Чат
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = () => ({ headers: { 'Authorization': `Bearer ${token}` } });

  // --- ЦВЕТОВАЯ ПАЛИТРА ДЛЯ ТЕМ ---
  const colors = isDarkMode ? {
    bgSidebar: '#09090b',
    bgChat: '#18181b',
    bgCard: '#27272a',
    border: '#3f3f46',
    textMain: '#fafafa',
    textMuted: '#a1a1aa',
    accent: '#fafafa',
    accentText: '#09090b',
    btnBg: '#27272a',
    btnText: '#fafafa',
    inputBg: '#18181b',
    gradientBase: '24,24,27',
    shadow: 'rgba(0,0,0,0.4)'
  } : {
    bgSidebar: '#f4f4f5',
    bgChat: '#ffffff',
    bgCard: '#e4e4e7',
    border: '#d4d4d8',
    textMain: '#18181b',
    textMuted: '#71717a',
    accent: '#18181b',
    accentText: '#ffffff',
    btnBg: '#18181b',
    btnText: '#ffffff',
    inputBg: '#ffffff',
    gradientBase: '255,255,255',
    shadow: 'rgba(0,0,0,0.08)'
  };

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

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

  const deleteDocument = async (docId: string) => {
    try {
      await axios.delete(`${API_URL}/documents/${docId}`, authHeaders());
      message.success('Чат успешно удален');

      setDocuments(prev => prev.filter(doc => doc.id !== docId));

      if (activeDocumentId === docId) {
        setActiveDocumentId(null);
        setMessages([]);
      }
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
      else message.error('Ошибка при удалении чата');
    }
  };

  const customUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      const res = await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` }
      });

      const documentId = res.data.document_id;
      setUploadStatus('processing');

      const pollInterval = setInterval(async () => {
        try {
          const progressRes = await axios.get(`${API_URL}/documents/progress/${documentId}`, authHeaders());
          const { status, current, total } = progressRes.data;

          setUploadStatus(status);

          if (total > 0) {
            const stagePercent = Math.round((current / total) * 100);

            if (status === 'extracting') {
                setUploadProgress(Math.floor(stagePercent * 0.2));
            }
            else if (status === 'processing') {
                setUploadProgress(20 + Math.floor(stagePercent * 0.8));
            }
          }

          if (status === 'completed') {
            clearInterval(pollInterval);

            setUploadProgress(100);
            setUploadStatus('success');
            setTimeout(() => setUploadStatus('idle'), 3000);

            await fetchDocuments();
            selectDocument(documentId);

            onSuccess(res.data);
            setIsUploading(false);
          }
          else if (status === 'error') {
            clearInterval(pollInterval);

            setUploadStatus('error');
            setTimeout(() => setUploadStatus('idle'), 4000);
            setIsUploading(false);

            onError(new Error("Сбой обработки"));
            message.error('Сбой при обработке PDF на сервере.');
          }

        } catch (pollError) {
          console.error("Ошибка проверки статуса:", pollError);
        }
      }, 1000);

    } catch (err: any) {
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 4000);
      setIsUploading(false);

      if (err.response?.status === 401) handleLogout();
      onError(err);
      message.error('Ошибка при загрузке документа.');
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bgSidebar, color: colors.textMain }}>
      <div style={{ padding: '20px 16px' }}>
        <Upload customRequest={customUpload} showUploadList={false} accept=".pdf">
          <Button block disabled={isUploading} style={{
            height: 44, background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}`,
            borderRadius: 16, fontWeight: 500, fontSize: 15
          }}>
            {isUploading ? <Spin indicator={<LoadingOutlined style={{ color: colors.textMain, marginRight: 8 }} spin />} /> : <PlusOutlined style={{ marginRight: 8 }} />}
            Загрузить PDF
          </Button>
        </Upload>

        {/* Индикатор загрузки и обработки */}
        {uploadStatus !== 'idle' && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Progress
              percent={uploadProgress}
              size="small"
              status={uploadStatus === 'error' ? 'exception' : uploadStatus === 'success' ? 'success' : 'active'}
              strokeColor={{ '0%': colors.border, '100%': colors.textMain }}
            />
            <div style={{ marginTop: 6, fontSize: 13, color: colors.textMuted }}>
              {uploadStatus === 'uploading' && `Отправка файла (${uploadProgress}%)...`}
              {uploadStatus === 'extracting' && <><SyncOutlined spin style={{marginRight: 4}}/> Чтение страниц...</>}
              {uploadStatus === 'processing' && <><SyncOutlined spin style={{marginRight: 4}}/> Индексация нейросетью...</>}
              {uploadStatus === 'success' && <span style={{color: '#4ade80'}}><CheckCircleOutlined style={{marginRight: 4}}/> Успешно!</span>}
              {uploadStatus === 'error' && <span style={{color: '#f87171'}}>Ошибка загрузки</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        <div style={{ fontSize: 13, color: colors.textMuted, padding: '12px 12px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Чаты
        </div>
        {documents.map(doc => (
          <div key={doc.id} onClick={() => selectDocument(doc.id)} style={{
              padding: '12px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              color: activeDocumentId === doc.id ? colors.textMain : colors.textMuted,
              background: activeDocumentId === doc.id ? colors.bgCard : 'transparent',
              transition: 'all 0.2s ease', marginBottom: 2, fontSize: 15
            }}>

            {/* Иконка и название файла */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
              <FileTextOutlined style={{ fontSize: 16, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
            </div>

            {/* Кнопка удаления */}
            <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <Popconfirm
                title={<Text style={{ color: colors.textMain, fontWeight: 500, fontSize: 15 }}>Удалить чат?</Text>}
                description={<Text style={{ color: colors.textMuted, fontSize: 14 }}>Это действие необратимо.</Text>}
                onConfirm={() => deleteDocument(doc.id)}
                okText="Да"
                cancelText="Нет"
                placement="right"
                icon={<DeleteOutlined style={{ color: '#ef4444', marginTop: 4 }} />}
                okButtonProps={{
                  style: {
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 500,
                    boxShadow: 'none'
                  }
                }}
                cancelButtonProps={{
                  style: {
                    background: 'transparent',
                    color: colors.textMain,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    boxShadow: 'none'
                  }
                }}
              >
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  style={{
                    color: colors.textMuted,
                    width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = colors.textMuted}
                />
              </Popconfirm>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px', borderTop: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar size={36} style={{ background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}` }} icon={<UserOutlined />} />
            <Text style={{ color: colors.textMain, fontWeight: 500, fontSize: 15 }}>{username}</Text>
          </div>

          {/* Кнопки переключения темы и выхода */}
          <div style={{ display: 'flex', gap: 4 }}>
            <Button type="text" icon={isDarkMode ? <SunOutlined style={{ color: colors.textMuted, fontSize: 16 }} /> : <MoonOutlined style={{ color: colors.textMuted, fontSize: 16 }} />} onClick={toggleTheme} />
            <Button type="text" icon={<LogoutOutlined style={{ color: colors.textMuted, fontSize: 16 }} />} onClick={handleLogout} />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorBgBase: colors.bgSidebar,
          colorBgElevated: colors.bgCard,
          colorTextBase: colors.textMain,
          colorPrimary: colors.accent,
          colorBorder: colors.border,
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 16, borderRadius: 12,
        },
      }}
    >
      {!token ? (
        // Экран авторизации
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: colors.bgSidebar, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 320 }}>
            <Title level={2} style={{ color: colors.textMain, marginBottom: 30, fontWeight: 600, textAlign: 'center' }}>
              {authMode === 'login' ? "Вход" : authMode === 'register' ? "Регистрация" : "Подтверждение"}
            </Title>

            {authMode === 'verify' ? (
              <>
                <Text style={{ color: colors.textMuted, display: 'block', marginBottom: 20, textAlign: 'center' }}>
                  Код отправлен на <br/><b>{emailInput}</b>
                </Text>
                <Input
                  size="large" placeholder="000000"
                  value={codeInput} onChange={e => setCodeInput(e.target.value)} onPressEnter={handleVerify}
                  style={{ marginBottom: 24, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 24, textAlign: 'center', letterSpacing: 10 }}
                  bordered={false} maxLength={6}
                />
                <Button type="primary" block onClick={handleVerify} style={{ borderRadius: 16, height: 50, background: colors.btnBg, color: colors.btnText, border: `1px solid ${colors.border}`, fontWeight: 600, fontSize: 16 }}>
                  Подтвердить
                </Button>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <a onClick={() => setAuthMode('register')} style={{ color: colors.textMuted, fontSize: 15 }}>Изменить данные</a>
                </div>
              </>
            ) : (
              <>
                <Input size="large" placeholder="Имя пользователя" value={loginInput} onChange={e => setLoginInput(e.target.value)} style={{ marginBottom: 12, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 16 }} bordered={false} />

                {authMode === 'register' && (
                  <Input size="large" placeholder="Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ marginBottom: 12, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 16 }} bordered={false} />
                )}

                <Input.Password size="large" placeholder="Пароль" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} onPressEnter={handleAuth} style={{ marginBottom: 24, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 16 }} bordered={false} />

                <Button type="primary" block onClick={handleAuth} style={{ borderRadius: 16, height: 50, background: colors.btnBg, color: colors.btnText, border: `1px solid ${colors.border}`, fontWeight: 600, fontSize: 16 }}>
                  {authMode === 'login' ? "Войти" : "Продолжить"}
                </Button>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <a onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ color: colors.textMuted, fontSize: 15 }}>
                    {authMode === 'login' ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Войти"}
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        // Главный интерфейс чата
        <Layout style={{ height: '100dvh', overflow: 'hidden', background: colors.bgChat }}>
          {isMobile ? (
            <Drawer placement="left" onClose={() => setDrawerVisible(false)} open={drawerVisible} bodyStyle={{ padding: 0 }} width={280} closeIcon={null}>
              {sidebarContent}
            </Drawer>
          ) : (
            <Sider width={280} style={{ borderRight: `1px solid ${colors.border}` }}>{sidebarContent}</Sider>
          )}

          <Layout style={{ background: colors.bgChat }}>
            {isMobile && (
              <Header style={{ padding: '0 16px', display: 'flex', alignItems: 'center', height: 60, background: colors.bgChat, borderBottom: `1px solid ${colors.border}` }}>
                <Button type="text" icon={<MenuOutlined style={{ color: colors.textMain, fontSize: 18 }}/>} onClick={() => setDrawerVisible(true)} style={{ padding: 0, marginRight: 16 }} />
                <Text style={{ color: colors.textMain, fontWeight: 500, fontSize: 17 }}>RAG Assistant</Text>
              </Header>
            )}

            <Content style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100dvh - 60px)' : '100dvh', position: 'relative' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '40px 0', scrollBehavior: 'smooth' }}>
                {isLoadingHistory ? (
                  <div style={{ textAlign: 'center', marginTop: '30vh' }}><Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: colors.textMuted }} spin />} /></div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: colors.textMuted }}>
                    <Title level={3} style={{ color: colors.textMain, margin: 0, fontWeight: 500 }}>Чем могу помочь?</Title>
                    <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 16 }}>{activeDocumentId ? "Документ загружен и готов." : "Загрузите PDF в левом меню."}</Text>
                  </div>
                ) : (
                  <div style={{ maxWidth: 800, margin: '0 auto', padding: isMobile ? '0' : '0 20px', display: 'flex', flexDirection: 'column', paddingBottom: 110 }}>
                    {messages.map((msg, idx) => (
                      <div key={idx} style={{
                        display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 36, width: '100%'
                      }}>
                        <div style={{
                          background: msg.role === 'user' ? colors.bgCard : 'transparent',
                          color: colors.textMain, padding: msg.role === 'user' ? '12px 20px' : '6px 0',
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
                        <div style={{ padding: '6px 0', color: colors.textMuted, display: 'flex', alignItems: 'center' }}>
                          <Spin indicator={<LoadingOutlined style={{ fontSize: 18, color: colors.textMuted }} spin />} />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Плавающее поле ввода */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: isMobile ? '12px' : '24px', background: `linear-gradient(180deg, rgba(${colors.gradientBase},0) 0%, rgba(${colors.gradientBase},0.9) 20%, rgba(${colors.gradientBase},1) 100%)`, pointerEvents: 'none' }}>
                <div style={{ maxWidth: 800, margin: '0 auto', pointerEvents: 'auto' }}>
                  <div style={{ background: colors.bgCard, borderRadius: 32, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'flex-end', padding: '10px 14px', boxShadow: `0 4px 24px ${colors.shadow}` }}>
                    <Input.TextArea
                      value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder={activeDocumentId ? "Напишите сообщение..." : "Выберите чат"}
                      disabled={!activeDocumentId || isUploading || isTyping} autoSize={{ minRows: 1, maxRows: 8 }} bordered={false}
                      style={{ color: colors.textMain, fontSize: 16, lineHeight: 1.6, padding: '8px 10px', resize: 'none', boxShadow: 'none' }}
                    />
                    <Button
                      type="primary" shape="circle" disabled={!activeDocumentId || !inputText.trim()} onClick={sendMessage} loading={isTyping}
                      style={{
                        background: inputText.trim() ? colors.accent : colors.border, color: inputText.trim() ? colors.accentText : colors.textMuted,
                        border: 'none', width: 36, height: 36, flexShrink: 0, marginBottom: 4, marginLeft: 10, display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      icon={<ArrowUpOutlined style={{ fontSize: 18 }} />}
                    />
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <Text style={{ fontSize: 13, color: colors.textMuted }}>Локальная нейросеть может ошибаться. Проверяйте факты.</Text>
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