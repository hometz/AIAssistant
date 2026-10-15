from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from main import app, send_verification_email

client = TestClient(app)


def test_register_user_success():
    with patch("database.create_unverified_user") as mock_db, \
            patch("main.smtplib.SMTP_SSL") as mock_smtp:
        mock_db.return_value = (True, "Пользователь создан")

        response = client.post("/users/register", json={
            "username": "test_user",
            "email": "test@example.com",
            "password": "Password123"
        })

        assert response.status_code == 200
        assert response.json() == {"message": "Код отправлен на почту"}
        mock_db.assert_called_once()

        mock_smtp.assert_called_once()


def test_register_user_weak_password():
    response = client.post("/users/register", json={
        "username": "test_user",
        "email": "test@example.com",
        "password": "weakpassword"  # Нет цифр и заглавных
    })

    assert response.status_code == 422


def test_send_verification_email_logic():
    with patch("main.smtplib.SMTP_SSL") as mock_smtp, \
            patch("main.os.getenv") as mock_getenv:

        def mock_env_vars(key):
            if key == "SMTP_SENDER": return "my_test_sender@gmail.com"
            if key == "SMTP_PASSWORD": return "fake_password"
            return None

        mock_getenv.side_effect = mock_env_vars

        test_email = "target@example.com"
        test_code = "777888"
        send_verification_email(test_email, test_code)

        mock_smtp.assert_called_once_with('smtp.gmail.com', 465)

        mock_server = mock_smtp.return_value

        mock_server.login.assert_called_once_with("my_test_sender@gmail.com", "fake_password")

        mock_server.send_message.assert_called_once()

        mock_server.quit.assert_called_once()