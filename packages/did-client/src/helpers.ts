// Functions to compare objects
import { DIDDocument } from 'did-resolver'
import { BulkDelegateParam, BulkAttributeParam, DelegateTypes } from '@verida/vda-did'
import { verificationMethodTypes, interpretIdentifier } from '@verida/vda-did-resolver'

export function deepEqual(object1: any, object2:any) {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (const key of keys1) {
        const val1 = object1[key];
        const val2 = object2[key];
        const areObjects = isObject(val1) && isObject(val2);
        if ( areObjects && !deepEqual(val1, val2) || !areObjects && val1 !== val2) {
            return false;
        }
    }
    return true;
}

export function isObject(object: any) {
    return object != null && typeof object === 'object';
}

export function compareKeys(a: Object, b: Object) {
    const aKeys = Object.keys(a).sort()
    const bKeys = Object.keys(b).sort()

    return JSON.stringify(aKeys) === JSON.stringify(bKeys)
}

export function removeCommonItems(orgDoc: DIDDocument, document: DIDDocument) {
    const keys = Object.keys(orgDoc);
    keys.forEach(key => {
        const orgItem = (orgDoc as any)[key]
        const newItem = (document as any)[key]
        
        if (key in <DIDDocument>document && Array.isArray(orgItem))  {
            const len = orgItem.length
            for (let i = len - 1; i >= 0; i--) {
                const docIndex = newItem.findIndex((t: any) => deepEqual(orgItem[i], t))
                if(docIndex !== -1) {
                    orgItem.splice(i, 1);
                    newItem.splice(docIndex, 1)
                }
            }
        }
    });
}

export function getUpdateListFromDocument(document: DIDDocument) {
    const delegateList : BulkDelegateParam[] = []
    const attributeList : BulkAttributeParam[] = [] 

    // Process delegates & attributes
    document?.verificationMethod?.forEach(item => {
        // DIDDelegateChanged for veriKey or Controller
        if ('blockchainAccountId' in item) {
            // console.log('helper found a delegate changed')
            if (item.id.endsWith('#controller')) {
                //Controller --> publicKey
                // No need to update this. Auto generated by resolver
            } else {
                const {address: did} = interpretIdentifier(item.id)
                // DIDDelegate Changed --> pks
                delegateList.push({
                    delegate: did, // convert it to did
                    delegateType: DelegateTypes.veriKey
                })

            }
        } else {
            // Meaning AttributeChanged of 'pub' type --> pk
            // did/pub/<key algorithm>/<key purpose>/<encoding>

            // console.log('helper found a attribute changed')

            let algorithm = 'Secp256k1'
            if (item.type === verificationMethodTypes.EcdsaSecp256k1RecoveryMethod2020 || 
                item.type === verificationMethodTypes.EcdsaSecp256k1VerificationKey2019) {
                algorithm = 'Secp256k1'
            } else if (item.type === verificationMethodTypes.Ed25519VerificationKey2018) {
                algorithm = 'Ed25519'
            } else if (item.type === verificationMethodTypes.RSAVerificationKey2018) {
                algorithm = 'Rsa'
            } else if (item.type === verificationMethodTypes.X25519KeyAgreementKey2019) {
                algorithm = 'X25519'
            }


            let keyPurpose = 'veriKey';
            if (document.authentication?.find(authItem => authItem === item.id)) {
                // meaning sigAuth attribute
                keyPurpose = 'sigAuth'
            } else if (document.keyAgreement?.find(keyrefItem => keyrefItem === item.id)) {
                // meaning enc attribute
                keyPurpose = 'enc'
            }
            
            let value = ''
            let encoding = null
            if ('publicKeyHex' in item) {
                encoding  = 'hex'
                value = item.publicKeyHex!
                if (!value.startsWith('0x')) {
                    value = `0x${value}`
                }
            } else if ('publicKeyBase64' in item) {
                encoding = 'base64'
                value = (item as any).publicKeyBase58
            } else if ('publicKeyBase58' in item) {
                encoding = 'base58'
                value = item.publicKeyBase58!
            } else if ('publicKeyPem' in item) {
                encoding = 'pem'
                value = (item as any).publicKeyPem
            } else if ('value' in item) {
                value = (item as any).value
            }


            const idMatch = item.id.match(/([\w,\:]+)(\?context=(\w+))?(\&type=(\w+))?/)
            const context = idMatch?.[3]
            const didType = idMatch?.[5]
            if (context) {
                value = `${value}?context=${context}`
                if (didType !== undefined) {
                    value=`${value}&type=${didType}`
                }
            }

            const name = `did/pub/${algorithm}/${keyPurpose}/${encoding}`

            // console.log('helper Attribute Key = ', name)
            // console.log('helper Attribute Value = ', value)

            // call revokeAttribute & setAttribute for updates
            attributeList.push({
                name,
                value,
                proof: (item as any).proof
            })
        }
    })
    // Process services
    document?.service?.forEach(serviceItem => {
        // did/svc/serviceName
        // name = 'did/svc/VeridaMessage'
        // value = serviceEndPoint + '##' + context + '##messaging', 
        
        const idMatch = serviceItem.id.match(/(.*)?context=(\w+)&type=(\w+)/)
        const context = idMatch?.[2]
        const suffix = idMatch?.[3]

        const name = `did/svc/${serviceItem.type}`
        const value = `${serviceItem.serviceEndpoint}?context=${context}&type=${suffix}`

        // console.log('helper Service Key = ', name)
        // console.log('helper Service Value = ', value)
        
        attributeList.push({
            name,
            value
        })
    })

    // console.log('delegateList ===== ', delegateList)
    // console.log('attributeList ===== ', attributeList)

    return {delegateList, attributeList}
}