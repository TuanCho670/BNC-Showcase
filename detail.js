const axios = require('axios');
const fs = require('fs');
const translate = require('google-translate-api');

// Định nghĩa từ khóa cho các sector
const keywords = {
  "Blockchain/Chuỗi khối": [
    "blockchain", "distributed ledger", "chuỗi khối", "sổ cái phân tán"
  ],
  "Finance/Tài chính": [
    "finance", "financial", "decentralized finance", "defi", 
    "tài chính", "tài chính phi tập trung"
  ],
  "Gaming/Trò chơi": [
    "gaming", "game", "play-to-earn", "gamefi",
    "trò chơi", "chơi để kiếm tiền"
  ],
  "AI/Trí tuệ nhân tạo": [
    "ai", "artificial intelligence", "machine learning",
    "trí tuệ nhân tạo", "học máy"
  ],
  "Smart Contract/Hợp đồng thông minh": [
    "smart contract", "hợp đồng thông minh"
  ],
  "Payments/Thanh toán": [
    "payment", "payments", "transaction",
    "thanh toán", "giao dịch"
  ],
  "NFT": [
    "nft", "non-fungible token", "digital collectible"
  ],
  "Infrastructure/Hạ tầng": [
    "infrastructure", "platform", "protocol",
    "hạ tầng", "nền tảng"
  ]
};

// Hàm xác định sector
function identifySector(description) {
  if (!description) return "Other/Khác";
  
  description = description.toLowerCase();
  const matchedSectors = Object.entries(keywords)
    .filter(([_, terms]) => terms.some(term => description.includes(term)))
    .map(([sector]) => sector);

  return matchedSectors.length > 0 ? matchedSectors.join(", ") : "Other/Khác";
}

// Hàm dịch văn bản
async function translateText(text) {
  try {
    const result = await translate(text, { from: 'en', to: 'vi' });
    return result.text;
  } catch (error) {
    console.error('Lỗi dịch:', error);
    return text;
  }
}

async function getCoinExtraInfo(symbol) {
  try {
    const url = `https://www.binance.info/bapi/apex/v1/friendly/apex/marketing/tardingPair/detail?symbol=${symbol}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.data) {
      const data = response.data.data;
      return {
        symbol: symbol,
        logo_url: data.url || null,
        explorers: data.eu ? data.eu.split(',') : [],
        website: data.ws || null,
        whitepaper: data.wpu || null
      };
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi lấy thông tin bổ sung cho ${symbol}:`, error.message);
    return null;
  }
}

async function getAllCoinsInfo() {
  try {
    const exchangeInfo = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
    const symbols = exchangeInfo.data.symbols
      .filter(pair => pair.status === 'TRADING' && pair.quoteAsset === 'USDT')
      .map(pair => pair.baseAsset);

    console.log(`Tìm thấy ${symbols.length} cặp giao dịch USDT`);

    const coinsInfo = [];
    for (const symbol of symbols) {
      console.log(`Đang lấy thông tin cho ${symbol}...`);
      
      // Lấy description
      const descResponse = await axios.get(
        `https://www.binance.info/bapi/apex/v1/public/apex/market/bts/get?btsKeys=symbol_desc_${symbol}&ns=symbol-description`
      );
      
      // Lấy thông tin bổ sung
      const extraInfo = await getCoinExtraInfo(symbol);
      
      if (descResponse.data?.data?.translations && extraInfo) {
        const description = descResponse.data.data.translations[`symbol_desc_${symbol}`] || '';
        
        // Dịch description
        console.log(`Đang dịch description cho ${symbol}...`);
        const translatedDesc = await translateText(description);
        
        // Xác định sector dựa trên description
        const sectors = identifySector(description);
        
        coinsInfo.push({
          symbol: `${symbol}/USDT`,
          description: description,
          description_vi: translatedDesc,
          sectors: sectors,
          logo_url: extraInfo.logo_url,
          explorers: extraInfo.explorers,
          website: extraInfo.website,
          whitepaper: extraInfo.whitepaper
        });
        
        console.log(`Đã lấy và dịch xong thông tin cho ${symbol}`);
      }
      
      // Delay để tránh rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Lưu vào file JSON
    const outputFile = 'coin_complete_info.json';
    fs.writeFileSync(outputFile, JSON.stringify(coinsInfo, null, 2));
    console.log(`Đã lưu thông tin vào file ${outputFile}`);

    return coinsInfo;
  } catch (error) {
    console.error('Lỗi:', error.message);
    throw error;
  }
}

// Chạy chương trình
getAllCoinsInfo()
  .then(() => console.log('Chương trình hoàn tất'))
  .catch(error => console.error('Lỗi chương trình:', error));
