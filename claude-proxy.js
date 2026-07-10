export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { base64, mediaType } = JSON.parse(event.body)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mediaType,
                  data: base64,
                }
              },
              {
                text: `Analise este comprovante de PIX brasileiro e retorne SOMENTE um JSON válido, sem markdown, sem explicação:
{"valor":number,"data":"YYYY-MM-DD","hora":"HH:MM","descricao":string_ou_null,"beneficiario":string_ou_null,"chave_pix":string_ou_null,"id_transacao":string_ou_null,"banco_origem":string_ou_null,"banco_destino":string_ou_null}
Campos ausentes → null. Retorne APENAS o JSON.`
              }
            ]
          }],
          generationConfig: { temperature: 0 }
        })
      }
    )

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ result: clean }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    }
  }
}
