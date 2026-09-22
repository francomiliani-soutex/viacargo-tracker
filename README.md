# viacargo-tracker

API propia de seguimiento de Via Cargo (scraping con navegador headless,
porque Via Cargo no tiene API pública y su buscador es una app Angular
que solo se puede leer ejecutando JavaScript real).

## Subir a GitHub

```bash
cd viacargo-tracker
git init
git add .
git commit -m "Primera version viacargo-tracker"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/viacargo-tracker.git
git push -u origin main
```

## Deploy en Render

1. Andá a https://dashboard.render.com → **New +** → **Web Service**.
2. Conectá tu repo de GitHub `viacargo-tracker`.
3. Render va a detectar `render.yaml` automáticamente. Si te pide
   confirmar variables de entorno, agregá:
   - `API_KEY` → inventá una clave larga random (ej: `sTx-9f2k...`), la
     vas a usar después desde Apps Script.
4. Plan **Free** alcanza para empezar.
5. Deploy. Te va a quedar una URL tipo:
   `https://viacargo-tracker.onrender.com`

## Uso

```
GET https://viacargo-tracker.onrender.com/track/999038515340
Header: x-api-key: TU_API_KEY
```

Respuesta:
```json
{
  "error": false,
  "transporte": "VIA CARGO",
  "numero": "999038515340",
  "estadoActual": "ENTREGADA",
  "lugarActual": "CORDOBA - ARGUELLO",
  "entregado": true,
  "cantidadPiezas": "9",
  "peso": "100 KG",
  "servicio": "VIA CARGO ESTANDAR",
  "firmadoPor": "YPF VB ENERGIA 30717139700",
  "historial": [ { "lugar": "...", "fecha": "...", "estado": "..." }, ... ]
}
```

## Importante — plan Free de Render

El plan gratuito "duerme" el servicio tras ~15 min sin uso. La primera
consulta después de estar dormido puede tardar 30-50 segundos en
responder (tiene que prender el servidor). Las siguientes son rápidas.
Si esto molesta en el uso diario, el plan pago (~7 USD/mes) lo mantiene
siempre despierto.

## Si Via Cargo cambia su sitio

Este scraper depende de la estructura actual de
`formularios.viacargo.com.ar`. Si Via Cargo rediseña esa página, el
scraper puede dejar de funcionar hasta que se ajuste `index.js` a la
nueva estructura (selectores del input, del botón, o el formato del
texto de resultado).
