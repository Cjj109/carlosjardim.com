# bcv-puente

Dólar y euro del BCV, leídos de `bcv.org.ve` completando a mano la cadena de
certificados que su servidor entrega mal.

    GET /api/bcv

    {
      "usd": 813.7361,
      "eur": 945.65085917,
      "fecha": "2026-09-07",     // el día en que rige, no el de hoy
      "source": "bcv.org.ve",
      "updated_at": "2026-09-06T11:26:00.870Z"
    }

## Qué está roto en el BCV

No es que la cadena esté incompleta, que es lo que uno supone: el servidor
manda un intermedio **equivocado**.

| | |
|---|---|
| Emisor real de `*.bcv.org.ve` | Sectigo Public Server Authentication CA **DV R36** |
| Intermedio que entrega el servidor | Sectigo **RSA Domain Validation Secure Server CA** |

Son CAs distintas: un sobrante de un certificado anterior. El intermedio bueno
no viaja en la conexión.

Los navegadores y la red de Cloudflare lo arreglan solos con *AIA fetching*:
leen la extensión `CA Issuers` del certificado, que apunta a
`http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt`, se bajan
el intermedio que falta y cierran la cadena. **Node no hace eso**, así que un
`fetch` normal muere con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

La solución es darle ese intermedio, que va en `api/sectigo-dv-r36.pem`. Se
**añade** a los certificados de confianza del sistema, no los reemplaza: la
verificación sigue entera y un intermediario seguiría siendo rechazado.

Lo que **no** se hace, y conviene dejarlo escrito: `rejectUnauthorized: false`.
Eso también "funcionaría", y de paso aceptaría el certificado de cualquiera que
se hiciera pasar por el BCV.

## Es el respaldo, no el principal

Medido, seis llamadas a cada camino saltándose la caché:

| camino | mediana |
|---|---|
| Cloudflare → BCV, **más otras cuatro fuentes en paralelo** | ~555 ms |
| Vercel → BCV, él solo | ~680 ms |

Leer el BCV desde Cloudflare es más rápido haciendo cinco cosas que este puente
haciendo una. Ponerlo de principal sería añadir un salto de red y un tercero
del que depender para arreglar algo que hoy no está roto.

Va en paralelo con las demás fuentes, así que estar ahí no cuesta tiempo. Cubre
el hueco real: **el euro**. DolarAPI no lo publica, así que sin esto el euro no
tenía ningún respaldo.

## Mantenimiento

- El intermedio empotrado caduca en **marzo de 2036**.
- El certificado del propio BCV caduca el **20/11/2026**. Al renovarlo puede que
  arreglen la cadena —entonces esto sobra pero no estorba— o que la rompan de
  otra forma.

## Desplegar

    cd vercel/bcv-puente
    vercel --prod
