module.exports = {
  maxAmount: 10000000000,
  maxPayloadLength: 10 * 1024 * 1024,
  blockHeaderLength: 248,
  addressLength: 208,
  maxAddressesLength: 208 * 128,
  maxClientConnections: 100,
  numberLength: 10000000000,
  feeStartVolume: 10000 * 10000000000,
  feeStart: 1,
  maxRequests: 10000 * 12,
  requestLength: 104,
  signatureLength: 196,
  maxSignaturesLength: 196 * 256,
  maxConfirmations : 77 * 100,
  confirmationLength: 77,
  fixedPoint : Math.pow(10, 10),
  totalAmount: 227420000000000000,
  initialSupply: 174200000000000000,
  maxTxsPerBlock: 500,
  maxDocVerificationAmount: 25,
  expDateOfKYC: 2, // default exp date of kyc in years
  defaultCurrency: 'BEL', // default currency symbole for Belrium
  maxWhiteListWallets: 10,
  fees: {
    send: 0.001,
    secondsignature: 0.001,
    delegate: 128,
    vote: 1,
    multisignature: 1,
    dapp: 50,
    inTransfer: 0.001,
    outTransfer: 0.001,
    account: 0,
    disableAccount: 0,
    attachWallets: {
      BEL: 0,
      NON_BEL: 0
    },
    attachWalletsOnBehalf: {
      BEL: 0,
      NON_BEL: 0
    },
    enableKYCOnBehalfOfUser: 0
  },
  blockHeightInterval: 2100000,
  milestonesBelPerBlock: [
    50000000000,  //Initial Reward Year 1
    25000000000,  //Year 2
    12500000000,  //Year 3
    6250000000,   //Year 4
    3125000000,   //Year 5
    1562500000,   //Year 6
    781250000,    //Year 7
    390625000,    //Year 8
    195312500,    //Year 9
    97656250,     //Year 10
    48828130,     //Year 11
    24414060,     //Year 12
    12207030,     //Year 13
    6103520,      //Year 14
    3051760,      //Year 15
    1525880,      //Year 16
    762940,       //Year 17
    381470,       //Year 18
    190730,       //Year 19
    95370,        //Year 20
    47680,        //Year 21
    23840,        //Year 22
    11920,        //Year 23
    5960,         //Year 24
    2980,         //Year 25
    1490,         //Year 26
    750,          //Year 27
    370,          //Year 28
    190           //Year 29 & next all years
  ]
}
