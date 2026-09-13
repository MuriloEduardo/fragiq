import { Readable } from "node:stream";
import unbzip2 from "unbzip2-stream";

/**
 * O mapa de uma partida, lido do cabeçalho da demo.
 *
 * O Game Coordinator devolve o scoreboard mas não o mapa. A demo tem — na
 * primeira mensagem do arquivo (CDemoFileHeader, com map_name e o nome do
 * servidor). Como o .dem.bz2 é comprimido em blocos de 900 KB, basta pedir
 * o primeiro bloco e descomprimi-lo: ~1,5 MB por partida, e não os 100 MB.
 */
const BYTES = 1_500_000;
const TIMEOUT_MS = 30_000;

export type CabecalhoDemo = { mapa: string | null; servidor: string | null };

export async function lerCabecalhoDaDemo(url: string): Promise<CabecalhoDemo> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { range: `bytes=0-${BYTES}` }, signal: controle.signal });
    if (!res.ok || !res.body) return { mapa: null, servidor: null };
    const inicio = await primeirosBytes(res.body, 65_536);
    return interpretar(inicio);
  } finally {
    clearTimeout(timer);
  }
}

/** Descomprime até ter `limite` bytes; o fluxo cortado no fim do range é esperado. */
function primeirosBytes(corpo: ReadableStream<Uint8Array>, limite: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const partes: Buffer[] = [];
    let total = 0;
    const saida = Readable.fromWeb(corpo as never).pipe(unbzip2());
    const fim = () => resolve(Buffer.concat(partes));
    saida.on("data", (c: Buffer) => {
      if (total >= limite) return;
      partes.push(c);
      total += c.length;
      if (total >= limite) {
        saida.destroy();
        fim();
      }
    });
    saida.on("error", fim);
    saida.on("end", fim);
    saida.on("close", fim);
  });
}

/**
 * PBDEMS2: 8 bytes de assinatura, dois int32, depois frames de
 * (varint comando, varint tick, varint tamanho, payload). O primeiro é o
 * DEM_FileHeader; dentro dele, protobuf com server_name no campo 3 e
 * map_name no 5.
 */
function interpretar(buf: Buffer): CabecalhoDemo {
  if (buf.subarray(0, 7).toString("latin1") !== "PBDEMS2") return { mapa: null, servidor: null };
  let p = 16;
  const varint = () => {
    let r = 0;
    let sh = 0;
    for (;;) {
      const b = buf[p++];
      if (b === undefined) throw new Error("cabeçalho truncado");
      r |= (b & 0x7f) << sh;
      if (!(b & 0x80)) return r >>> 0;
      sh += 7;
    }
  };
  try {
    const cmd = varint();
    varint();
    const tam = varint();
    if (cmd !== 1) return { mapa: null, servidor: null };
    const corpo = buf.subarray(p, p + tam);
    const campos = new Map<number, string>();
    let q = 0;
    while (q < corpo.length) {
      const chave = corpo[q++];
      const campo = chave >> 3;
      const tipo = chave & 7;
      if (tipo === 2) {
        let len = 0;
        let sh = 0;
        for (;;) {
          const b = corpo[q++];
          len |= (b & 0x7f) << sh;
          if (!(b & 0x80)) break;
          sh += 7;
        }
        campos.set(campo, corpo.subarray(q, q + len).toString("utf8"));
        q += len;
      } else if (tipo === 0) {
        while (corpo[q++] & 0x80);
      } else break;
    }
    return { mapa: campos.get(5) || null, servidor: campos.get(3) || null };
  } catch {
    return { mapa: null, servidor: null };
  }
}
