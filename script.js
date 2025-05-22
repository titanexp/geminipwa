// script.js

const modelSelector = document.getElementById('model-name');
const userInput = document.getElementById('user-input');
const messageContainer = document.getElementById('message-container');
const sendButton = document.getElementById('send-button');

let apiKey = 'YOUR_API_KEY'; // APIキーをここに設定

// API呼び出しのための共通関数
async function callApi(model, messages) {
    if (model.includes('claude')) {
        return await callClaudeApi(messages);
    } else {
        return await callGeminiApi(messages);
    }
}

// Claude APIを呼び出す関数
async function callClaudeApi(messages) {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: modelSelector.value,
        messages: messages
    }, {
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
        }
    });
    return response.data;
}

// Gemini APIを呼び出す関数
async function callGeminiApi(messages) {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${modelSelector.value}:generate`, {
        messages: messages
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });
    return response.data;
}

// メッセージを送信する関数
async function sendMessage() {
    const userMessage = userInput.value.trim();
    if (!userMessage) return; // 空メッセージは送信しない

    const messages = [{ role: 'user', content: userMessage }];
    const response = await callApi(modelSelector.value, messages);
    
    // レスポンスを表示
    const modelResponse = response.choices[0].message.content;
    displayMessage('user', userMessage);
    displayMessage('model', modelResponse);
    
    userInput.value = ''; // 入力欄をクリア
}

// メッセージを表示する関数
function displayMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    messageDiv.textContent = content;
    messageContainer.appendChild(messageDiv);
}

// 送信ボタンにイベントリスナーを追加
sendButton.addEventListener('click', sendMessage);
