/**
 * Dólar y euro del BCV, leídos de bcv.org.ve.
 *
 * POR QUÉ EXISTE ESTO
 *
 * carlosjardim.com ya lee el BCV directamente desde Cloudflare y funciona.
 * Este puente es el respaldo, y existe sobre todo por el euro: si el camino
 * del BCV se cae, el dólar tiene a DolarAPI detrás, pero DolarAPI no publica
 * euro. Sin esto, la tarjeta del euro se queda en un guion y no hay plan B.
 *
 * EL CERTIFICADO, QUE ES TODO EL TRUCO
 *
 * bcv.org.ve entrega una cadena de certificados rota. Y no es que le falte un
 * eslabón, que es lo que uno supone: manda uno EQUIVOCADO.
 *
 *   El certificado de *.bcv.org.ve lo emite
 *     "Sectigo Public Server Authentication CA DV R36"
 *   pero el servidor entrega como intermedio
 *     "Sectigo RSA Domain Validation Secure Server CA"
 *
 * Son CAs distintas: un sobrante de un certificado anterior. El intermedio
 * bueno no viaja en la conexión.
 *
 * Los navegadores y Cloudflare lo arreglan solos con AIA fetching: leen la
 * extensión "CA Issuers" del certificado, que dice dónde bajar el emisor que
 * falta, lo descargan y cierran la cadena. Node no hace eso, así que un fetch
 * normal desde aquí muere con UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * La solución es darle a Node ese intermedio, que va empotrado al lado en
 * sectigo-dv-r36.pem. Se AÑADE a los certificados de confianza del sistema,
 * no los reemplaza, y la verificación sigue entera: si alguien se pusiera en
 * medio, la conexión seguiría fallando como debe.
 *
 * Lo que NO se hace, y conviene dejarlo escrito para que a nadie le tiente:
 * rejectUnauthorized: false. Eso también "funcionaría", y de paso aceptaría
 * el certificado de cualquiera que se hiciera pasar por el BCV.
 *
 * Mantenimiento: el intermedio caduca en marzo de 2036. El certificado del
 * propio BCV caduca el 20/11/2026, y al renovarlo puede que arreglen la
 * cadena —entonces esto sobra pero no estorba— o que la rompan de otra forma.
 */

import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { rootCertificates } from 'node:tls';

const BCV_URL = 'https://www.bcv.org.ve/';

// Se lee una vez por arranque en frío, no en cada petición
let confianza = null;

function certificadosDeConfianza() {
  if (confianza) return confianza;

  // Relativo al módulo y no a process.cwd(): en serverless el directorio de
  // trabajo no es donde uno cree, y una ruta basada en cwd funciona en local
  // y falla desplegada.
  const pem = readFileSync(new URL('./sectigo-dv-r36.pem', import.meta.url), 'utf8');
  // Los del sistema MÁS el que falta. La raíz que lo firma (Sectigo Public
  // Server Authentication Root R46) ya viene con Node, así que con este basta.
  confianza = [...rootCertificates, pem];
  return confianza;
}

function bajarBCV() {
  return new Promise((resolve, reject) => {
    const peticion = request(
      BCV_URL,
      {
        ca: certificadosDeConfianza(),
        // 5 s y no 12: quien llama (carlosjardim.com/api/bcv) corta a los 6,
        // asi que los 12 de antes eran tolerancia inalcanzable — el puente
        // seguia trabajando en respuestas que ya nadie iba a recoger. Los dos
        // presupuestos tienen que hablar entre si, y el de fuera manda.
        timeout: 5000,
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; carlosjardim.com/1.0)',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let html = '';
        res.setEncoding('utf8');
        res.on('data', (trozo) => { html += trozo; });
        res.on('end', () => resolve(html));
      }
    );

    peticion.on('timeout', () => peticion.destroy(new Error('se agotó el tiempo')));
    peticion.on('error', reject);
    peticion.end();
  });
}

/** "945,65085917" -> 945.65085917 */
function aNumero(texto) {
  return parseFloat(String(texto).trim().replace(/\./g, '').replace(',', '.'));
}

/**
 * Extrae el valor de una moneda del bloque que le corresponde.
 *
 * Primero ancla en el id y solo después busca el <strong>, dentro de una
 * ventana corta. La página tiene decenas de <strong> y buscarlo suelto leería
 * cualquier otro.
 */
function leerMoneda(html, id) {
  const inicio = html.indexOf(`id="${id}"`);
  if (inicio === -1) return null;

  const encontrado = html.slice(inicio, inicio + 600).match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  if (!encontrado) return null;

  const valor = aNumero(encontrado[1]);
  // Si la página cambia y se lee cualquier cosa, mejor null que un disparate
  return Number.isFinite(valor) && valor > 0 && valor < 1_000_000 ? valor : null;
}

/**
 * Fecha de vigencia.
 *
 * No es la de hoy: el BCV publica la tasa del próximo día hábil. Un domingo,
 * esta fecha es la del lunes.
 */
function leerFecha(html) {
  const iso = html.match(/date-display-single[^>]*content="(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  try {
    const html = await bajarBCV();

    const usd = leerMoneda(html, 'dolar');
    const eur = leerMoneda(html, 'euro');

    if (usd == null && eur == null) {
      return res.status(502).json({
        error: 'No se pudo leer ninguna tasa de la página',
        bytes: html.length,
      });
    }

    return res.status(200).json({
      usd,
      eur,
      // El día en que esa tasa entra en vigor, no el de hoy
      fecha: leerFecha(html),
      source: 'bcv.org.ve',
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(502).json({
      error: 'No se pudo consultar el BCV',
      detalle: error.code || error.message,
    });
  }
}
