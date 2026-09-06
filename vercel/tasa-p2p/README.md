# tasa-p2p

Función que devuelve la tasa p2p de USDT/VES leída del libro de Binance.

Existe porque Binance rechaza las peticiones que salen de la red de Cloudflare,
donde vive `carlosjardim.com`. Desde Vercel sí responde.

**Vive aquí porque el proyecto de Vercel no tiene repo de Git.** Se desplegó
subiendo los archivos a mano, así que su código solo existía dentro del último
despliegue: si ese despliegue se borra, el código se pierde. Esta copia es la
buena; lo que está en Vercel es el resultado de desplegarla.

    GET /api/p2p

    {
      "rate": 956.27,        // = media, por compatibilidad con clientes viejos
      "venta": 951.56,       // lo que TE PAGAN si vendes USDT
      "compra": 960.97,      // lo que PAGAS si compras USDT
      "media": 956.27,       // el punto medio, sin ponderar
      "spread": 9.41,
      "ads": 82,
      "ads_venta": 41,
      "ads_compra": 41,
      "min": 906.22,
      "max": 1006.69,
      "zelle_por_usdt": 1.0346,
      "zelle_ads": 40,
      "source": "binance-p2p",
      "updated_at": "2026-09-06T11:00:28.043Z"
    }

Toma dos páginas de cada lado del mercado y calcula el promedio recortado
descartando el 20% de los extremos, **cada lado por separado**.

## Por qué cada lado por separado

Antes se echaban los dos lados en el mismo saco y salía un solo número. Eso
tenía dos problemas:

1. Ese número no era ni la compra ni la venta, sino un punto medio al que no
   ejecuta nadie. La calculadora lo usaba para decir cuánto te dan por vender,
   y eso es medio por ciento menos.

2. Ni siquiera era un punto medio fiable. Al mezclar y recortar sobre el total,
   el resultado se pondera por cuántos anuncios trae cada lado: si Binance
   devuelve 41 de un lado y 20 del otro, la cifra se desplaza hacia el lado más
   poblado sin que el mercado se haya movido.

## El `tradeType`, que confunde a todo el mundo

Es la acción de **quien pregunta**, no la del anunciante. Pedir
`tradeType=SELL` devuelve anuncios con `adv.tradeType=BUY` —gente que te
compra—, y ese es el precio al que tú vendes. Es el más bajo de los dos.
Comprobado contra el libro: con `SELL` salen ~951 y con `BUY` ~961.

## Desplegar

    cd vercel/tasa-p2p
    vercel --prod
