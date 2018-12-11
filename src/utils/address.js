var crypto = require('crypto')
var base58check = require('./base58check')

const NORMAL_PREFIX = 'A' // A

module.exports = {
  isAddress: function (address) {
    if (typeof address !== 'string') {
      return false
    }
    if (!/^[0-9]{1,20}$/g.test(address)) {
      if (!base58check.decodeUnsafe(address.slice(1))) {
        return false
      }
      if (['A'].indexOf(address[0]) == -1) {
        return false
      }
    }
    return true
  },

  isBase58CheckAddress: function (address) {
    if (typeof address !== 'string') {
      return false
    }
    if (!base58check.decodeUnsafe(address.slice(1))) {
      return false
    }
    if (['A'].indexOf(address[0]) == -1) {
      return false
    }
    return true
  },

  generateBase58CheckAddress: function (publicKey) {
    if (typeof publicKey === 'string') {
      publicKey = Buffer.from(publicKey, 'hex')
    }
    var h1 = crypto.createHash('sha256').update(publicKey).digest()
    var h2 = crypto.createHash('ripemd160').update(h1).digest()
    return NORMAL_PREFIX + base58check.encode(h2)
  },
  generateAddressWithCountryCode: function (address, countryCode) {
    return address + countryCode;
  },
  removeCountryCodeFromAddress: function (address) {
      return address.slice(0, -2);
  },
  getCountryCodeFromAddress: function (address) {
    var conCode = address.substring(address.length-2, address.lenght);
    return conCode;
  }
}