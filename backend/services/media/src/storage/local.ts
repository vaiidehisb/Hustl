// Local filesystem storage: bytes are uploaded through the service and served
// through HMAC-signed, short-lived URLs.

import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Transform, type Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { errors } from "@hustl/common"
import { DOWNLOAD_TTL_SECONDS, publicUrl, signFile, UPLOAD_TTL_SECONDS } from "../signing"
import type { LocalStorageDriver } from "./types"

export class PayloadTooLargeError extends Error {}

export function createLocalDriver(dir: string): LocalStorageDriver {
  const root = path.resolve(dir)

  const resolve = (key: string) => {
    const p = path.resolve(root, key)
    if (!p.startsWith(root + path.sep)) throw errors.badRequest("Invalid storage key")
    return p
  }

  return {
    name: "local",
    bucket: "local",

    async createUpload(asset) {
      return {
        method: "PUT",
        url: publicUrl(`/media/uploads/${asset.id}/content`),
        headers: { "content-type": asset.mimeType },
        expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
        driver: "local",
      }
    },

    async stat(key) {
      try {
        const s = await stat(resolve(key))
        return s.isFile() ? { size: s.size } : null
      } catch {
        return null
      }
    },

    async downloadUrl(asset) {
      const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS
      return {
        url: publicUrl(`/media/files/${asset.id}?exp=${exp}&sig=${signFile(asset.id, exp)}`),
        expiresAt: new Date(exp * 1000).toISOString(),
      }
    },

    async put(key, body) {
      const p = resolve(key)
      await mkdir(path.dirname(p), { recursive: true })
      await writeFile(`${p}.part`, body)
      await rename(`${p}.part`, p)
    },

    async remove(key) {
      await rm(resolve(key), { force: true })
    },

    async write(key, body: Readable, maxBytes) {
      const p = resolve(key)
      const part = `${p}.part`
      await mkdir(path.dirname(p), { recursive: true })
      let bytes = 0
      const limiter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          bytes += chunk.length
          if (bytes > maxBytes) cb(new PayloadTooLargeError(`Upload exceeds the declared size of ${maxBytes} bytes`))
          else cb(null, chunk)
        },
      })
      try {
        await pipeline(body, limiter, createWriteStream(part))
        await rename(part, p)
        return bytes
      } catch (err) {
        await rm(part, { force: true })
        throw err
      }
    },

    read(key) {
      return createReadStream(resolve(key))
    },
  }
}
