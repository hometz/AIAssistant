import { useState, useRef, useEffect } from 'react'
import './App.css'

function App() {
  const [fileId, setFileId] = useState(null)
  const [filename, setFilename] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  const [question, setQuestion] = useState("")
  const [chatHistory, setChatHistory] = useState([])
  const [isAsking, setIsAsking] = useState(false)

  const chatEndRef = useRef(null)

  // Автоматическая прокрутка чата вниз при новом сообщении
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // Функция загрузки файла на сервер
  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      // Отправляем запрос на наш FastAPI бэкенд
      const response = await fetch("http://127.0.0.1:8000/documents/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (data.file_id) {
        setFileId(data.file_id)
        setFilename(data.filename)
        // Добавляем приветственное сообщение от ИИ
        setChatHistory([
          { role: 'ai', content: `Файл "${data.filename}" успешно загружен! Задайте мне вопрос по его содержимому.` }
        ])
      } else {
        alert("Ошибка при загрузке: " + data.error)
      }
    } catch (error) {
      alert("Не удалось подключиться к серверу.")
    } finally {
      setIsUploading(false)
    }
  }

  // Функция отправки вопроса в RAG
  const handleAskQuestion = async (e) => {
    e.preventDefault()
    if (!question.trim() || isAsking) return

    const currentQuestion = question
    setQuestion("") // Очищаем поле ввода

    // Сразу добавляем вопрос пользователя в UI
    setChatHistory(prev => [...prev, { role: 'user', content: currentQuestion }])
    setIsAsking(true)

    try {
      const response = await fetch("http://127.0.0.1:8000/chat/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          file_id: fileId,
          question: currentQuestion
        })
      })

      const data = await response.json()

      if (data.answer) {
        // Добавляем ответ ИИ в UI
        setChatHistory(prev => [...prev, { role: 'ai', content: data.answer }])
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', content: "Ошибка: " + data.error }])
      }
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'ai', content: "Ошибка сети. Проверьте, запущен ли бэкенд." }])
    } finally {
      setIsAsking(false)
    }
  }

  // ЭКРАН 1: Загрузка документа (если fileId еще нет)
  if (!fileId) {
    return (
      <div className="container center-screen">
        <h2>RAG Assistant</h2>
        <p>Для начала работы загрузите PDF-документ</p>
        <div className="upload-box">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            disabled={isUploading}
            id="file-upload"
          />
          <label htmlFor="file-upload" className="upload-btn">
            {isUploading ? "Обработка файла..." : "Выбрать PDF файл"}
          </label>
        </div>
      </div>
    )
  }

  // ЭКРАН 2: Чат (если fileId уже есть)
  return (
    <div className="container chat-layout">
      <div className="chat-header">
        <h3>Чат по документу: {filename}</h3>
        <button onClick={() => setFileId(null)} className="reset-btn">Загрузить другой</button>
      </div>

      <div className="chat-window">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`message-wrapper ${msg.role === 'user' ? 'user' : 'ai'}`}>
            <div className="message-bubble">
              {msg.content}
            </div>
          </div>
        ))}
        {isAsking && (
          <div className="message-wrapper ai">
            <div className="message-bubble loading">Ассистент печатает...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="input-area" onSubmit={handleAskQuestion}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Спросите что-нибудь о документе..."
          disabled={isAsking}
        />
        <button type="submit" disabled={isAsking || !question.trim()}>
          Отправить
        </button>
      </form>
    </div>
  )
}

export default App