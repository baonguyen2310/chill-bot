const loadData = async () => {
    try {
        const response = await fetch('data.txt');
        if (!response.ok) throw new Error("Không thể đọc file");
        const text = await response.text();
        return text
    } catch (error) {
        console.error("Lỗi:", error);
    }
}

// Thêm hàm gọi Gemini API
async function askGemini(text) {
    const myData = await loadData()

    let personalityPrompt;
    switch(currentMode) {
        case 'sassy':
            personalityPrompt = 'tính cách nghiêm túc.';
            break;
        case 'cute':
            personalityPrompt = 'tính cách hài hước dễ thương. ';
            break;
        case 'serious':
            personalityPrompt = 'tính cách chảnh choẹ';
            break;
        default:
            personalityPrompt = 'tính cách bình thường';
    }

    try {
        const APIKEY = '';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${APIKEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Bạn tên là ChillBot, một Robot 2 bánh tự cân bằng thông minh với ${personalityPrompt}. Hãy trả lời câu hỏi sau ngắn gọn: "${text}".`
                    }]
                }]
            })
        });

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini API error:', error);
        return 'Xin lỗi, tôi đang gặp vấn đề kết nối.';
    }
}