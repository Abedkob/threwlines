import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = publicKey.export({ format: "jwk" });

// Historical name, deliberately unchanged: clients cache the JWKS and match
// on kid, so a new id would break offline verification for installed clients.
const keyId = "threwlines-license-1";

console.log(`LICENSE_SIGNING_KEY_ID=${keyId}`);
console.log(`LICENSE_SIGNING_PRIVATE_JWK='${JSON.stringify(privateJwk)}'`);
console.log(`LICENSE_SIGNING_PUBLIC_JWK='${JSON.stringify(publicJwk)}'`);
