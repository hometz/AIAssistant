import { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Upload, Button, Input, Spin, message, Grid, Drawer, Avatar, ConfigProvider, theme, Progress, Popconfirm, Tooltip } from 'antd';
import {
  ArrowUpOutlined, LoadingOutlined, UserOutlined, FileTextOutlined,
  LogoutOutlined, MenuOutlined, PlusOutlined, SyncOutlined,
  CheckCircleOutlined, SunOutlined, MoonOutlined, DeleteOutlined,
  CloseOutlined, LeftOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined, EyeOutlined,
  InboxOutlined, MenuFoldOutlined, MenuUnfoldOutlined
} from '@ant-design/icons';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import './index.css';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { Dragger } = Upload;

const API_URL = 'http://127.0.0.1:8000';
const MAX_USERNAME_LENGTH = 20;
const MIN_USERNAME_LENGTH = 3;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;

interface SourceItem {
  page: number;
  text: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  sources?: SourceItem[];
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
    return savedTheme !== 'light';
  });

  // Состояния сайдбара (ширина, сворачивание, перетаскивание границы)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('sidebarWidth'));
    return saved >= MIN_SIDEBAR_WIDTH && saved <= MAX_SIDEBAR_WIDTH ? saved : 280;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState<boolean>(false);
  const [isHoveringResizer, setIsHoveringResizer] = useState<boolean>(false);

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

  // Состояния загрузки и Drag-and-Drop
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting' | 'processing' | 'success' | 'error'>('idle');
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);
  const dragCounter = useRef(0);

  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Чат
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Предпросмотр PDF
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [previewTotalPages, setPreviewTotalPages] = useState<number>(1);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [activeSources, setActiveSources] = useState<SourceItem[]>([]);

  const authHeaders = () => ({ headers: { 'Authorization': `Bearer ${token}` } });

  const activeDocFilename = documents.find(d => d.id === activeDocumentId)?.filename || 'Документ';

  const fontStack = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

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

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  // Обработка перетаскивания ширины сайдбара
  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < 90) {
        setSidebarCollapsed(true);
        localStorage.setItem('sidebarCollapsed', 'true');
        setIsResizingSidebar(false);
        return;
      }
      const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX));
      setSidebarWidth(nextWidth);
      localStorage.setItem('sidebarWidth', String(nextWidth));
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  // Установка названия вкладки браузера
  useEffect(() => {
    document.title = 'AIAssistant';
  }, []);

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
    setPreviewOpen(false);
    setActiveSources([]);
    setAuthMode('login');
  };

  const handleAuth = async () => {
    const trimmedLogin = loginInput.trim();
    if (!trimmedLogin || !passwordInput.trim()) {
      return message.warning("Заполните все обязательные поля");
    }
    if (trimmedLogin.length < MIN_USERNAME_LENGTH || trimmedLogin.length > MAX_USERNAME_LENGTH) {
      return message.warning(`Имя пользователя должно быть от ${MIN_USERNAME_LENGTH} до ${MAX_USERNAME_LENGTH} символов`);
    }
    if (authMode === 'register' && !emailInput.trim()) {
      return message.warning("Введите email");
    }

    try {
      if (authMode === 'register') {
        await axios.post(`${API_URL}/users/register`, {
          username: trimmedLogin,
          email: emailInput.trim(),
          password: passwordInput
        });
        message.success("Код отправлен на почту!");
        setAuthMode('verify');
      } else {
        const res = await axios.post(`${API_URL}/users/login`, {
          username: trimmedLogin,
          password: passwordInput
        });
        saveSession(res.data.access_token, res.data.username);
      }
    } catch (err: any) {
      if (err.response?.status === 422) {
        message.error("Проверьте данные: ник 3–20 симв., пароль мин. 8 симв. (буква + цифра)");
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
    setPreviewOpen(false);
    setPreviewImage(null);
    setActiveSources([]);
    setIsLoadingHistory(true);
    if (isMobile) setDrawerVisible(false);
    try {
      const res = await axios.get(`${API_URL}/chat/history/${docId}`, authHeaders());
      const historyMessages: ChatMessage[] = res.data.messages || [];
      setMessages(historyMessages);

      // Если в истории есть ответы с источниками, запоминаем последний для быстрого открытия
      const lastAiWithSources = [...historyMessages].reverse().find(m => m.role === 'ai' && m.sources && m.sources.length > 0);
      if (lastAiWithSources && lastAiWithSources.sources) {
        setActiveSources(lastAiWithSources.sources);
      }
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
        setPreviewOpen(false);
        setActiveSources([]);
      }
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
      else message.error('Ошибка при удалении чата');
    }
  };

  // --- ЗАГРУЗКА СТРАНИЦЫ ПРЕДПРОСМОТРА С ВЫДЕЛЕНИЕМ ---
  const loadPreviewPage = async (page: number, highlightText?: string, customSources?: SourceItem[], docIdOverride?: string) => {
    const targetDocId = docIdOverride || activeDocumentId;
    if (!targetDocId) return;

    const sourcesList = customSources !== undefined ? customSources : activeSources;
    const textToHighlight = highlightText !== undefined
      ? highlightText
      : (sourcesList.find(s => s.page === page)?.text || '');

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewPage(page);

    try {
      const res = await axios.post(
        `${API_URL}/documents/preview`,
        {
          document_id: targetDocId,
          page: page,
          highlight_text: textToHighlight
        },
        authHeaders()
      );
      setPreviewImage(res.data.image);
      setPreviewPage(res.data.page);
      setPreviewTotalPages(res.data.total_pages);
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Не удалось загрузить страницу PDF');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Кнопка открытия/закрытия предпросмотра в шапке
  const togglePreview = () => {
    if (previewOpen) {
      setPreviewOpen(false);
    } else if (activeSources.length > 0) {
      loadPreviewPage(activeSources[0].page, activeSources[0].text, activeSources);
    } else {
      loadPreviewPage(1, '');
    }
  };

  const customUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;

    if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
      message.warning('Поддерживаются только файлы в формате PDF');
      onError?.(new Error('Неверный формат файла'));
      return;
    }

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
            } else if (status === 'processing') {
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
            onSuccess?.(res.data);
            setIsUploading(false);
          } else if (status === 'error') {
            clearInterval(pollInterval);
            setUploadStatus('error');
            setTimeout(() => setUploadStatus('idle'), 4000);
            setIsUploading(false);
            onError?.(new Error("Сбой обработки"));
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
      onError?.(err);
      message.error('Ошибка при загрузке документа.');
    }
  };

  // --- ГЛОБАЛЬНЫЙ DRAG AND DROP ПО ОКНУ ---
  const handleWindowDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token || isUploading) return;
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOverWindow(true);
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOverWindow(false);
    }
  };

  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOverWindow(false);

    if (!token || isUploading) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const file = droppedFiles[0];
      customUpload({ file });
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeDocumentId) return;
    const userText = inputText;
    const currentDocId = activeDocumentId;

    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await axios.post(`${API_URL}/chat/ask`, { document_id: currentDocId, question: userText }, authHeaders());

      if (response.data.error) {
        setMessages(prev => [...prev, { role: 'ai', content: `⚠️ Ошибка сервера: ${response.data.error}` }]);
        setIsTyping(false);
        return;
      }

      const newSources: SourceItem[] = response.data.sources || [];
      const answerText = response.data.answer || "Ответ пуст.";

      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content: answerText,
          sources: newSources
        }
      ]);

      // Если пришли источники — сохраняем их и обновляем открытое окно предпросмотра
      if (newSources.length > 0) {
        setActiveSources(newSources);
        if (previewOpen) {
          loadPreviewPage(newSources[0].page, newSources[0].text, newSources, currentDocId);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 401) handleLogout();
      else message.error('Ошибка сети при запросе к серверу');
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

  // Сайдбар с изолированным блоком загрузки и кнопкой скрытия панели
  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bgSidebar, color: colors.textMain, position: 'relative' }}>
      {/* Верхняя шапка сайдбара с кнопкой сворачивания */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0', flexShrink: 0 }}>
        <Text style={{ color: colors.textMain, fontWeight: 600, fontSize: 15, letterSpacing: '0.2px' }}>
          AIAssistant
        </Text>
        {!isMobile && (
          <Tooltip title="Скрыть боковую панель" placement="right">
            <Button
              type="text"
              size="small"
              icon={<MenuFoldOutlined style={{ color: colors.textMuted, fontSize: 16 }} />}
              onClick={toggleSidebarCollapse}
              style={{ width: 30, height: 30, borderRadius: 8 }}
            />
          </Tooltip>
        )}
      </div>

      {/* Блок загрузки файла (flexShrink: 0 и отдельный контейнер для Dragger, чтобы статус не перекрывал чаты) */}
      <div style={{ padding: '12px 16px 16px', flexShrink: 0 }}>
        <div style={{ height: 'auto' }}>
          <Dragger
            customRequest={customUpload}
            showUploadList={false}
            accept=".pdf"
            disabled={isUploading}
            style={{
              background: colors.bgCard,
              border: `1px dashed ${colors.border}`,
              borderRadius: 16,
              padding: '8px 6px',
              height: 'auto',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: colors.textMain, padding: '4px 0' }}>
              {isUploading ? (
                <Spin indicator={<LoadingOutlined style={{ color: colors.textMain, fontSize: 20 }} spin />} />
              ) : (
                <PlusOutlined style={{ fontSize: 18, color: colors.textMain }} />
              )}
              <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3 }}>Загрузить PDF</div>
              <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.2 }}>Нажмите или перетащите файл</div>
            </div>
          </Dragger>
        </div>

        {uploadStatus !== 'idle' && (
          <div style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            textAlign: 'center'
          }}>
            <Progress
              percent={uploadProgress}
              size="small"
              status={uploadStatus === 'error' ? 'exception' : uploadStatus === 'success' ? 'success' : 'active'}
              strokeColor={{ '0%': colors.border, '100%': colors.textMain }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
              {uploadStatus === 'uploading' && `Отправка файла (${uploadProgress}%)...`}
              {uploadStatus === 'extracting' && <><SyncOutlined spin style={{ marginRight: 6 }} />Чтение страниц...</>}
              {uploadStatus === 'processing' && <><SyncOutlined spin style={{ marginRight: 6 }} />Индексация нейросетью...</>}
              {uploadStatus === 'success' && <span style={{ color: '#4ade80' }}><CheckCircleOutlined style={{ marginRight: 6 }} />Успешно!</span>}
              {uploadStatus === 'error' && <span style={{ color: '#f87171' }}>Ошибка загрузки</span>}
            </div>
          </div>
        )}
      </div>

      {/* Список чатов */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', minHeight: 0 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, padding: '4px 12px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Чаты
        </div>
        {documents.map(doc => (
          <div key={doc.id} onClick={() => selectDocument(doc.id)} style={{
            padding: '10px 12px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: activeDocumentId === doc.id ? colors.textMain : colors.textMuted,
            background: activeDocumentId === doc.id ? colors.bgCard : 'transparent',
            transition: 'all 0.2s ease', marginBottom: 2, fontSize: 15
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
              <FileTextOutlined style={{ fontSize: 16, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
            </div>

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
                  style: { background: '#ef4444', color: '#ffffff', border: 'none', borderRadius: 8, fontWeight: 500, boxShadow: 'none' }
                }}
                cancelButtonProps={{
                  style: { background: 'transparent', color: colors.textMain, border: `1px solid ${colors.border}`, borderRadius: 8, boxShadow: 'none' }
                }}
              >
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  style={{ color: colors.textMuted, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = colors.textMuted}
                />
              </Popconfirm>
            </div>
          </div>
        ))}
      </div>

      {/* Нижняя панель пользователя */}
      <div style={{ padding: '16px', borderTop: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', flex: 1 }}>
            <Avatar size={36} style={{ background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}`, flexShrink: 0 }} icon={<UserOutlined />} />
            <Text
              title={username || ''}
              style={{
                color: colors.textMain,
                fontWeight: 500,
                fontSize: 15,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {username}
            </Text>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <Button type="text" icon={isDarkMode ? <SunOutlined style={{ color: colors.textMuted, fontSize: 16 }} /> : <MoonOutlined style={{ color: colors.textMuted, fontSize: 16 }} />} onClick={toggleTheme} />
            <Button type="text" icon={<LogoutOutlined style={{ color: colors.textMuted, fontSize: 16 }} />} onClick={handleLogout} />
          </div>
        </div>
      </div>

      {/* Ползунок изменения ширины сайдбара (на десктопе) */}
      {!isMobile && !sidebarCollapsed && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
          onMouseEnter={() => setIsHoveringResizer(true)}
          onMouseLeave={() => setIsHoveringResizer(false)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 20,
            background: isResizingSidebar || isHoveringResizer ? colors.border : 'transparent',
            transition: 'background 0.15s ease'
          }}
        />
      )}
    </div>
  );

  // Панель предпросмотра PDF
  const previewPanelContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bgSidebar, borderLeft: 'none' }}>
      <div style={{ padding: '12px 16px', height: 60, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            size="small"
            disabled={previewPage <= 1 || previewLoading}
            onClick={() => loadPreviewPage(previewPage - 1)}
            icon={<LeftOutlined />}
            style={{ background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}` }}
          />
          <Text style={{ color: colors.textMain, fontSize: 14, minWidth: 90, textAlign: 'center' }}>
            Стр. {previewPage} / {previewTotalPages}
          </Text>
          <Button
            size="small"
            disabled={previewPage >= previewTotalPages || previewLoading}
            onClick={() => loadPreviewPage(previewPage + 1)}
            icon={<RightOutlined />}
            style={{ background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}` }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button
            size="small"
            onClick={() => setPreviewZoom(z => Math.max(60, z - 20))}
            icon={<ZoomOutOutlined />}
            style={{ background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}` }}
          />
          <Button
            size="small"
            onClick={() => setPreviewZoom(z => Math.min(200, z + 20))}
            icon={<ZoomInOutlined />}
            style={{ background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}` }}
          />
          <Button
            type="text"
            size="small"
            onClick={() => setPreviewOpen(false)}
            icon={<CloseOutlined style={{ color: colors.textMuted }} />}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        {previewLoading ? (
          <div style={{ marginTop: '30vh' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: colors.textMuted }} spin />} />
          </div>
        ) : previewImage ? (
          <img
            src={previewImage}
            alt={`Страница ${previewPage}`}
            style={{
              width: `${previewZoom}%`,
              maxWidth: previewZoom === 100 ? '100%' : 'none',
              borderRadius: 8,
              boxShadow: `0 4px 20px ${colors.shadow}`,
              transition: 'width 0.2s ease'
            }}
          />
        ) : null}
      </div>
    </div>
  );

  // Шапка чата всегда видна, если боковая панель скрыта, чтобы можно было её вернуть
  const showHeader = isMobile || sidebarCollapsed || Boolean(activeDocumentId);

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
          fontFamily: fontStack,
          fontSize: 16,
          borderRadius: 12,
        },
      }}
    >
      {!token ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: colors.bgSidebar, padding: 20, fontFamily: fontStack }}>
          <div style={{ width: '100%', maxWidth: 320 }}>
            <Title level={2} style={{ color: colors.textMain, marginBottom: 30, fontWeight: 600, textAlign: 'center', fontFamily: fontStack }}>
              {authMode === 'login' ? "Вход" : authMode === 'register' ? "Регистрация" : "Подтверждение"}
            </Title>

            {authMode === 'verify' ? (
              <>
                <Text style={{ color: colors.textMuted, display: 'block', marginBottom: 20, textAlign: 'center', fontFamily: fontStack }}>
                  Код отправлен на <br/><b>{emailInput}</b>
                </Text>
                <Input
                  size="large" placeholder="000000"
                  value={codeInput} onChange={e => setCodeInput(e.target.value)} onPressEnter={handleVerify}
                  style={{ marginBottom: 24, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 24, textAlign: 'center', letterSpacing: 10, fontFamily: fontStack }}
                  bordered={false} maxLength={6}
                />
                <Button type="primary" block onClick={handleVerify} style={{ borderRadius: 16, height: 50, background: colors.btnBg, color: colors.btnText, border: `1px solid ${colors.border}`, fontWeight: 600, fontSize: 16, fontFamily: fontStack }}>
                  Подтвердить
                </Button>
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <Button
                    type="text"
                    onClick={() => setAuthMode('register')}
                    style={{
                      fontFamily: fontStack,
                      color: colors.textMuted,
                      fontSize: 14,
                      fontWeight: 500,
                      borderRadius: 12,
                      padding: '6px 14px',
                      height: 'auto'
                    }}
                  >
                    Изменить данные
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Input
                  size="large"
                  placeholder="Имя пользователя (до 20 симв.)"
                  value={loginInput}
                  maxLength={MAX_USERNAME_LENGTH}
                  onChange={e => setLoginInput(e.target.value)}
                  style={{ marginBottom: 12, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 16, fontFamily: fontStack }}
                  bordered={false}
                />
                {authMode === 'register' && (
                  <Input
                    size="large"
                    placeholder="Email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    style={{ marginBottom: 12, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 16, fontFamily: fontStack }}
                    bordered={false}
                  />
                )}
                <Input.Password
                  size="large"
                  placeholder="Пароль"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  onPressEnter={handleAuth}
                  style={{ marginBottom: 24, borderRadius: 16, background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.textMain, padding: '14px 16px', fontSize: 16, fontFamily: fontStack }}
                  bordered={false}
                />
                <Button type="primary" block onClick={handleAuth} style={{ borderRadius: 16, height: 50, background: colors.btnBg, color: colors.btnText, border: `1px solid ${colors.border}`, fontWeight: 600, fontSize: 16, fontFamily: fontStack }}>
                  {authMode === 'login' ? "Войти" : "Продолжить"}
                </Button>
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <Button
                    type="text"
                    onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                    style={{
                      fontFamily: fontStack,
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: '0.1px',
                      borderRadius: 12,
                      padding: '6px 14px',
                      height: 'auto',
                      color: colors.textMuted
                    }}
                  >
                    {authMode === 'login' ? (
                      <span>Нет аккаунта? <span style={{ color: colors.textMain, fontWeight: 600 }}>Регистрация</span></span>
                    ) : (
                      <span>Уже есть аккаунт? <span style={{ color: colors.textMain, fontWeight: 600 }}>Войти</span></span>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleWindowDragEnter}
          onDragLeave={handleWindowDragLeave}
          onDragOver={handleWindowDragOver}
          onDrop={handleWindowDrop}
          style={{ position: 'relative', height: '100dvh', width: '100vw', overflow: 'hidden' }}
        >
          {/* Оверлей при перетаскивании файла в окно */}
          {isDraggingOverWindow && (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: isDarkMode ? 'rgba(9, 9, 11, 0.82)' : 'rgba(244, 244, 245, 0.85)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{
                padding: '40px 56px',
                borderRadius: 28,
                background: colors.bgCard,
                border: `2px dashed ${colors.textMain}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                boxShadow: `0 12px 40px ${colors.shadow}`
              }}>
                <InboxOutlined style={{ fontSize: 48, color: colors.textMain }} />
                <Title level={4} style={{ margin: 0, color: colors.textMain, fontFamily: fontStack }}>
                  Перетащите PDF сюда
                </Title>
                <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: fontStack }}>
                  Отпустите файл для начала загрузки и индексации
                </Text>
              </div>
            </div>
          )}

          <Layout style={{ height: '100dvh', overflow: 'hidden', background: colors.bgChat }}>
            {isMobile ? (
              <Drawer placement="left" onClose={() => setDrawerVisible(false)} open={drawerVisible} bodyStyle={{ padding: 0 }} width={280} closeIcon={null}>
                {sidebarContent}
              </Drawer>
            ) : (
              <Sider
                width={sidebarCollapsed ? 0 : sidebarWidth}
                style={{
                  borderRight: 'none',
                  overflow: 'hidden',
                  transition: isResizingSidebar ? 'none' : 'all 0.2s ease'
                }}
              >
                {sidebarContent}
              </Sider>
            )}

            <Layout style={{ background: colors.bgChat, display: 'flex', flexDirection: 'row', flex: 1, minWidth: 0 }}>
              {/* Левая/Центральная часть: Чат */}
              <Layout style={{ background: colors.bgChat, flex: 1, minWidth: 0 }}>
                {showHeader && (
                  <Header style={{ padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, background: colors.bgChat, borderBottom: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', gap: 12 }}>
                      {isMobile && (
                        <Button type="text" icon={<MenuOutlined style={{ color: colors.textMain, fontSize: 18 }}/>} onClick={() => setDrawerVisible(true)} style={{ padding: 0 }} />
                      )}
                      {!isMobile && sidebarCollapsed && (
                        <Tooltip title="Показать боковую панель" placement="bottom">
                          <Button
                            type="text"
                            icon={<MenuUnfoldOutlined style={{ color: colors.textMain, fontSize: 18 }} />}
                            onClick={toggleSidebarCollapse}
                            style={{ width: 34, height: 34, borderRadius: 10, background: colors.bgCard, border: `1px solid ${colors.border}` }}
                          />
                        </Tooltip>
                      )}
                      <Text style={{ color: colors.textMain, fontWeight: 500, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeDocumentId ? activeDocFilename : 'AIAssistant'}
                      </Text>
                    </div>
                    {activeDocumentId && (
                      <Button
                        onClick={togglePreview}
                        icon={<EyeOutlined />}
                        style={{
                          borderRadius: 10,
                          background: previewOpen ? colors.accent : colors.bgCard,
                          color: previewOpen ? colors.accentText : colors.textMain,
                          border: `1px solid ${colors.border}`,
                          fontSize: 14,
                          height: 34
                        }}
                      >
                        {!isMobile && (previewOpen ? 'Скрыть документ' : 'Открыть документ')}
                      </Button>
                    )}
                  </Header>
                )}

                <Content style={{ display: 'flex', flexDirection: 'column', height: showHeader ? 'calc(100dvh - 60px)' : '100dvh', position: 'relative' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '40px 0', scrollBehavior: 'smooth' }}>
                    {isLoadingHistory ? (
                      <div style={{ textAlign: 'center', marginTop: '30vh' }}><Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: colors.textMuted }} spin />} /></div>
                    ) : messages.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: colors.textMuted, padding: '0 20px', textAlign: 'center' }}>
                        <Title level={3} style={{ color: colors.textMain, margin: 0, fontWeight: 500 }}>Чем могу помочь?</Title>
                        <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 16 }}>
                          {activeDocumentId
                            ? "Документ загружен и готов. Задайте вопрос ниже."
                            : "Выберите чат слева или просто перетащите PDF-файл в это окно."}
                        </Text>
                        {activeDocumentId && !previewOpen && (
                          <Button
                            onClick={() => loadPreviewPage(1, '')}
                            icon={<EyeOutlined />}
                            style={{ marginTop: 20, borderRadius: 12, background: colors.bgCard, color: colors.textMain, border: `1px solid ${colors.border}` }}
                          >
                            Открыть документ
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div style={{ maxWidth: 800, margin: '0 auto', padding: isMobile ? '0' : '0 20px', display: 'flex', flexDirection: 'column', paddingBottom: 110 }}>
                        {messages.map((msg, idx) => (
                          <div key={idx} style={{
                            display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 36, width: '100%'
                          }}>
                            <div style={{
                              background: msg.role === 'user' ? colors.bgCard : 'transparent',
                              color: colors.textMain, padding: msg.role === 'user' ? '12px 20px' : '6px 0',
                              borderRadius: 24, borderBottomRightRadius: msg.role === 'user' ? 6 : 24,
                              maxWidth: msg.role === 'user' ? '75%' : '100%', fontSize: 16, lineHeight: 1.75,
                              fontWeight: 400, letterSpacing: '0.2px'
                            }}>
                              {msg.role === 'user' ? (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                              ) : (
                                <div className="markdown-body">
                                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>
                              )}
                            </div>

                            {/* Кнопки источников с переходом к странице и подсветкой */}
                            {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                {msg.sources.map((src, sIdx) => {
                                  const isCurrentPage = previewOpen && previewPage === src.page;
                                  return (
                                    <Button
                                      key={sIdx}
                                      size="small"
                                      icon={<FileTextOutlined />}
                                      onClick={() => {
                                        setActiveSources(msg.sources || []);
                                        loadPreviewPage(src.page, src.text, msg.sources || []);
                                      }}
                                      style={{
                                        borderRadius: 10,
                                        background: isCurrentPage ? colors.accent : colors.bgCard,
                                        color: isCurrentPage ? colors.accentText : colors.textMuted,
                                        border: `1px solid ${colors.border}`,
                                        fontSize: 13,
                                        height: 28
                                      }}
                                    >
                                      Стр. {src.page}
                                    </Button>
                                  );
                                })}
                              </div>
                            )}
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
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>Нейросеть может ошибаться. Проверяйте факты по подсвеченным источникам.</Text>
                      </div>
                    </div>
                  </div>
                </Content>
              </Layout>

              {/* Правая часть: Предпросмотр документа */}
              {previewOpen && (
                isMobile ? (
                  <Drawer placement="right" onClose={() => setPreviewOpen(false)} open={previewOpen} bodyStyle={{ padding: 0 }} width="100%" closeIcon={null}>
                    {previewPanelContent}
                  </Drawer>
                ) : (
                  <div style={{ width: '45%', maxWidth: 650, minWidth: 380, height: '100dvh' }}>
                    {previewPanelContent}
                  </div>
                )
              )}
            </Layout>
          </Layout>
        </div>
      )}
    </ConfigProvider>
  );
}

export default App;