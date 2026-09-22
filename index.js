/**
 * ============================================================
 * API DE SEGUIMIENTO — VIA CARGO (Soutex)
 * ============================================================
 * Via Cargo no tiene API pública: su buscador de seguimiento es
 * una app Angular (formularios.viacargo.com.ar) que renderiza
 * el resultado con JavaScript. Por eso acá usamos un navegador
 * headless real (Puppeteer) en vez de un simple fetch/HTML parse.
 *
 * Pensado desde el día 1 para poder exponerse a clientes finales
 * más adelante:
 *   - Respuesta JSON limpia y estable (no HTML crudo)
 *   - Protegido con API key (header x-api-key)
 *   - CORS habilitado para poder llamarlo desde un frontend público
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null; // si no se define, la API queda abierta (solo para pruebas)

const URL_SEGUIMIENTO = 'https://formularios.viacargo.com.ar/seguimiento-envio/';
const TIMEOUT_MS = 25000;

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ]
  });
  return browserInstance;
}

/**
 * Middleware simple de autenticación por API key.
 * Se activa solo si se configuró la variable de entorno API_KEY.
 */
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // sin key configurada = abierta (dev)
  const provided = req.header('x-api-key') || req.query.apiKey;
  if (provided !== API_KEY) {
    return res.status(401).json({ error: true, mensaje: 'API key inválida o faltante' });
  }
  next();
}

app.get('/', (req, res) => {
  res.json({ ok: true, servicio: 'viacargo-tracker', uso: 'GET /track/:numero (header x-api-key requerido si está configurado)' });
});

app.get('/track/:numero', requireApiKey, async (req, res) => {
  const numero = String(req.params.numero || '').trim();

  if (!numero) {
    return res.status(400).json({ error: true, mensaje: 'Falta el número de envío' });
  }

  let page = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setDefaultTimeout(TIMEOUT_MS);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');

    await page.goto(URL_SEGUIMIENTO, { waitUntil: 'networkidle2' });

    // Input del número de envío (Angular Material)
    const inputSelector = 'input[type="number"], input[matinput]';
    await page.waitForSelector(inputSelector, { visible: true });
    await page.click(inputSelector);
    await page.type(inputSelector, numero, { delay: 30 }); // .type() dispara los eventos que Angular necesita

    // Botón "Buscar"
    const [boton] = await page.$x("//button[contains(., 'Buscar')]");
    if (!boton) throw new Error('No se encontró el botón Buscar (¿cambió el sitio?)');
    await boton.click();

    // Esperamos a que aparezca el resultado o un mensaje de error
    await page.waitForFunction(
      () => document.body.innerText.includes('Número de envío') ||
            document.body.innerText.toLowerCase().includes('no encontr') ||
            document.body.innerText.toLowerCase().includes('no existe'),
      { timeout: TIMEOUT_MS }
    );

    const datos = await page.evaluate(() => {
      const texto = document.body.innerText;

      function valorDespuesDe(etiqueta) {
        const lineas = texto.split('\n').map(l => l.trim()).filter(l => l !== '');
        const idx = lineas.findIndex(l => l.toLowerCase().includes(etiqueta.toLowerCase()));
        return idx !== -1 && lineas[idx + 1] ? lineas[idx + 1] : '';
      }

      // Timeline: bloques "LOCALIDAD" / "fecha hora • estado"
      const lineas = texto.split('\n').map(l => l.trim()).filter(l => l !== '');
      let idxDetalle = lineas.findIndex(l => l.toLowerCase().includes('detalle de tu envio') || l.toLowerCase().includes('detalle de tu envío'));
      let historial = [];
      if (idxDetalle !== -1) {
        for (let i = idxDetalle + 1; i < lineas.length - 1; i += 2) {
          const posibleFechaEstado = lineas[i + 1];
          if (posibleFechaEstado && posibleFechaEstado.includes('•')) {
            const [fechaHora, estado] = posibleFechaEstado.split('•').map(s => s.trim());
            historial.push({ lugar: lineas[i], fecha: fechaHora, estado: estado });
          } else {
            break;
          }
        }
      }

      return {
        encontrado: texto.includes('Número de envío'),
        cantidadPiezas: valorDespuesDe('Cantidad de piezas'),
        peso: valorDespuesDe('Peso'),
        servicio: valorDespuesDe('Servicio'),
        firmadoPor: valorDespuesDe('Firmado por'),
        historial: historial
      };
    });

    await page.close();

    if (!datos.encontrado) {
      return res.status(404).json({ error: true, mensaje: 'Número de envío no encontrado en Via Cargo', numero });
    }

    const ultimo = datos.historial.length ? datos.historial[datos.historial.length - 1] : null;

    return res.json({
      error: false,
      transporte: 'VIA CARGO',
      numero,
      estadoActual: ultimo ? ultimo.estado : 'Sin datos',
      lugarActual: ultimo ? ultimo.lugar : '',
      entregado: ultimo ? /entregad/i.test(ultimo.estado) : false,
      cantidadPiezas: datos.cantidadPiezas,
      peso: datos.peso,
      servicio: datos.servicio,
      firmadoPor: datos.firmadoPor,
      historial: datos.historial
    });

  } catch (err) {
    if (page) { try { await page.close(); } catch (_) {} }
    return res.status(500).json({ error: true, mensaje: 'Error consultando Via Cargo: ' + err.message, numero });
  }
});

app.listen(PORT, () => {
  console.log(`viacargo-tracker escuchando en puerto ${PORT}`);
});
