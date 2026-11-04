import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = publicKey.export({ format: "jwk" });

const keyId = "threwlines-license-1";

console.log(`LICENSE_SIGNING_KEY_ID=${keyId}`);
console.log(`LICENSE_SIGNING_PRIVATE_JWK='${JSON.stringify(privateJwk)}'`);
console.log(`LICENSE_SIGNING_PUBLIC_JWK='${JSON.stringify(publicJwk)}'`);
