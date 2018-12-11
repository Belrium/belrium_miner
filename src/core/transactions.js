var ByteBuffer = require("bytebuffer");
var crypto = require('crypto');
var async = require('async');
var _ = require('lodash');
var ed = require('../utils/ed.js');
var constants = require('../utils/constants.js');
var slots = require('../utils/slots.js');
var Router = require('../utils/router.js');
var TransactionTypes = require('../utils/transaction-types.js');
var sandboxHelper = require('../utils/sandbox.js');
var addressHelper = require('../utils/address.js');
var httpCall = require('../utils/httpCall.js');

var genesisblock = null;
// Private fields
var modules, library, self, private = {}, shared = {};

private.unconfirmedNumber = 0;
private.unconfirmedTransactions = [];
private.unconfirmedTransactionsId = [];
private.unconfirmedTransactionsIdIndex = {};

function Transfer() {
  this.create = function (data, trs) {
    trs.recipientId = data.recipientId;
    trs.amount = data.amount;
    trs.countryCode = data.countryCode;
    trs.asset.countryCode =  data.recepientCountryCode
    return trs;
  }

  this.calculateFee = function (trs, sender) {
    return library.base.block.calculateFee();
  }

  this.verify = function (trs, sender, cb) {
    /*if (!addressHelper.isAddress(trs.recipientId)) {
      return cb("Invalid recipient");
    }*/

    if (trs.amount <= 0) {
      return cb("Invalid transaction amount");
    }

    if (trs.recipientId == sender.address) {
      return cb("Invalid recipientId, cannot be your self");
    }

    if (!global.featureSwitch.enableMoreLockTypes) {
      var lastBlock = modules.blocks.getLastBlock()
      if (sender.lockHeight && lastBlock && lastBlock.height + 1 <= sender.lockHeight) {
        return cb('Account is locked')
      }
    }

    cb(null, trs);
  }

  this.process = function (trs, sender, cb) {
    setImmediate(cb, null, trs);
  }

  this.getBytes = function (trs) {
    try {
      var buf = trs.asset && trs.asset.countryCode && trs.asset.countryCode ? new Buffer(trs.asset.countryCode, 'utf8') : null;
    } catch (e) {
      throw Error(e.toString());
    }

    return buf;
  }

  this.apply = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.countryCode)? trs.asset.countryCode: '';
    modules.accounts.setAccountAndGet({ address: trs.recipientId, countryCode: recepientCountryCode }, function (err, recipient) {
      if (err) {
        return cb(err);
      }

      modules.accounts.mergeAccountAndGet({
        address: trs.recipientId,
        balance: trs.amount,
        u_balance: trs.amount,
        blockId: block.id,
        round: modules.round.calc(block.height)
      }, function (err) {
        cb(err);
      });
    });
  }

  this.undo = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.countryCode)? trs.asset.countryCode: '';    
    modules.accounts.setAccountAndGet({ address: trs.recipientId, countryCode: recepientCountryCode }, function (err, recipient) {    
      if (err) {
        return cb(err);
      }

      modules.accounts.mergeAccountAndGet({
        address: trs.recipientId,
        balance: -trs.amount,
        u_balance: -trs.amount,
        blockId: block.id,
        round: modules.round.calc(block.height)
      }, function (err) {
        cb(err);
      });
    });
  }

  this.applyUnconfirmed = function (trs, sender, cb) {
    modules.accounts.getAccount({address: trs.recipientId}, function(err, account) {
      if(!account || account.status != 1) {
        var idKey = trs.recipientId + ':' + trs.type
        if (library.oneoff.has(idKey)) {
          return setImmediate(cb, 'Double submit')
        }
        library.oneoff.set(idKey, true)
      } 
      setImmediate(cb);
    });
  }

  this.undoUnconfirmed = function (trs, sender, cb) {
    var idKey = trs.recipientId + ':' + trs.type;
    library.oneoff.delete(idKey);
    setImmediate(cb);
  }

  this.objectNormalize = function (trs) {
    delete trs.blockId;
    return trs;
  }

  this.dbRead = function (raw) {
    if (!raw.cc_countryCode) {
			return null;
		} else {
			var countryCode = raw.cc_countryCode;
			return {countryCode: countryCode};
		}
    return null;
  }

  this.dbSave = function (trs, cb) {
    library.dbLite.query("INSERT INTO ac_countrycode(countryCode, transactionId) VALUES($countryCode, $transactionId)", {
      countryCode: trs.asset && trs.asset.countryCode? trs.asset.countryCode: '',
      transactionId: trs.id
    }, cb);
    //setImmediate(cb);
  }

  this.ready = function (trs, sender) {
    if (sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }

      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

function InitialTransfer() {
  this.create = function (data, trs) {
    trs.recipientId = data.recipientId;
    trs.amount = data.amount;
    trs.countryCode = data.countryCode;
    trs.asset.countryCode =  data.recepientCountryCode
    return trs;
  }

  this.calculateFee = function (trs, sender) {
    return library.base.block.calculateFee();
  }

  this.verify = function (trs, sender, cb) {
    /*if (!addressHelper.isAddress(trs.recipientId)) {
      return cb("Invalid recipient");
    }*/

    if (trs.amount <= 0) {
      return cb("Invalid transaction amount");
    }

    if (trs.recipientId == sender.address) {
      return cb("Invalid recipientId, cannot be your self");
    }

    if (!global.featureSwitch.enableMoreLockTypes) {
      var lastBlock = modules.blocks.getLastBlock()
      if (sender.lockHeight && lastBlock && lastBlock.height + 1 <= sender.lockHeight) {
        return cb('Account is locked')
      }
    }

    cb(null, trs);
  }

  this.process = function (trs, sender, cb) {
    setImmediate(cb, null, trs);
  }

  this.getBytes = function (trs) {
    try {
      var buf = trs.asset && trs.asset.countryCode && trs.asset.countryCode ? new Buffer(trs.asset.countryCode, 'utf8') : null;
    } catch (e) {
      throw Error(e.toString());
    }

    return buf;
  }

  this.apply = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.countryCode)? trs.asset.countryCode: '';
    modules.accounts.setAccountAndGet({ address: trs.recipientId, countryCode: recepientCountryCode }, function (err, recipient) {
      if (err) {
        return cb(err);
      }

      modules.accounts.mergeAccountAndGet({
        address: trs.recipientId,
        balance: trs.amount,
        u_balance: trs.amount,
        blockId: block.id,
        round: modules.round.calc(block.height)
      }, function (err) {
        cb(err);
      });
    });
  }

  this.undo = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.countryCode)? trs.asset.countryCode: '';    
    modules.accounts.setAccountAndGet({ address: trs.recipientId, countryCode: recepientCountryCode }, function (err, recipient) {    
      if (err) {
        return cb(err);
      }

      modules.accounts.mergeAccountAndGet({
        address: trs.recipientId,
        balance: -trs.amount,
        u_balance: -trs.amount,
        blockId: block.id,
        round: modules.round.calc(block.height)
      }, function (err) {
        cb(err);
      });
    });
  }

  this.applyUnconfirmed = function (trs, sender, cb) {
    modules.accounts.getAccount({address: trs.recipientId}, function(err, account) {
      if(!account) {
        var idKey = sender.address + ':' + trs.type
        if (library.oneoff.has(idKey)) {
          return setImmediate(cb, 'Double submit')
        }
        library.oneoff.set(idKey, true)
      }
      setImmediate(cb);
    });
  }

  this.undoUnconfirmed = function (trs, sender, cb) {
    var idKey = sender.address + ':' + trs.type;
    library.oneoff.delete(idKey);
    setImmediate(cb);
  }

  this.objectNormalize = function (trs) {
    delete trs.blockId;
    return trs;
  }

  this.dbRead = function (raw) {
    if (!raw.cc_countryCode) {
			return null;
		} else {
			var countryCode = raw.cc_countryCode;
			return {countryCode: countryCode};
		}
  }

  this.dbSave = function (trs, cb) {
    library.dbLite.query("INSERT INTO ac_countrycode(countryCode, transactionId) VALUES($countryCode, $transactionId)", {
      countryCode: trs.asset && trs.asset.countryCode? trs.asset.countryCode: '',
      transactionId: trs.id
    }, cb);
  }

  this.ready = function (trs, sender) {
    if (sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }

      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

//ON Behalf payment for document verifivcation.
function OnBehalfPaymentForDocVerification () {
	this.create = function (data, trs) {
    trs.payFor = data.payFor;
		trs.recipientId = data.recipientId;
    trs.amount = data.amount;
    trs.countryCode = data.countryCode;
    trs.asset.onBehalf = {
      countryCode:  data.recepientCountryCode,
      payFor: data.payFor,
      payForCountryCode: data.payForCountryCode
    };
		return trs;
	};

	this.calculateFee = function (trs, sender) {
    return library.base.block.calculateFee();
	};

	this.verify = function (trs, sender, cb) {

		if (!trs.recipientId) {
			return setImmediate(cb, 'Invalid recipient');
		}

    if (trs.amount <= 0) {
      return cb("Invalid transaction amount");
    }

    if (trs.recipientId == sender.address) {
      return cb("Invalid recipientId, cannot be your self");
    }

    if (!global.featureSwitch.enableMoreLockTypes) {
      var lastBlock = modules.blocks.getLastBlock()
      if (sender.lockHeight && lastBlock && lastBlock.height + 1 <= sender.lockHeight) {
        return cb('Account is locked')
      }
    }

    modules.accounts.getAccount({address: trs.recipientId}, function(err, recipient) {
      if(err) {
        return cb(err);
      }
      if(!recipient) {
        return cb("Recipient not found!");
      }
      cb(null, trs);
    });
	};

	this.process = function (trs, sender, cb) {    
    modules.accounts.getAccount({address: trs.payFor}, function(err, account) {
      if(err) {
        return cb(err);
      }
      if(account && (account.countryCode != trs.asset.onBehalf.payForCountryCode)) {
        return cb("payFor country code mismatched!");
      }
      
      return setImmediate(cb, null, trs);
    });
	};

	this.getBytes = function (trs) {
		try {
      var buf = trs.asset && trs.asset.onBehalf && trs.asset.onBehalf.countryCode? new Buffer(trs.asset.onBehalf.countryCode, 'utf8') : null;
    } catch (e) {
      throw Error(e.toString());
    }

    return buf;
	};

	this.apply = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.onBehalf && trs.asset.onBehalf.countryCode)? trs.asset.onBehalf.countryCode: '';
    modules.accounts.setAccountAndGet({ address: trs.recipientId, countryCode: recepientCountryCode }, function (err, recipient) {
      if (err) {
        return cb(err);
      }

      modules.accounts.mergeAccountAndGet({
        address: trs.recipientId,
        balance: trs.amount,
        u_balance: trs.amount,
        blockId: block.id,
        round: modules.round.calc(block.height)
      }, function (err) {
        cb(err);
      });
    });
	};

	this.undo = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.onBehalf && trs.asset.onBehalf.countryCode)? trs.asset.onBehalf.countryCode: '';    
    modules.accounts.setAccountAndGet({ address: trs.recipientId, countryCode: recepientCountryCode }, function (err, recipient) {    
      if (err) {
        return cb(err);
      }

      modules.accounts.mergeAccountAndGet({
        address: trs.recipientId,
        balance: -trs.amount,
        u_balance: -trs.amount,
        blockId: block.id,
        round: modules.round.calc(block.height)
      }, function (err) {
        cb(err);
      });
    });
	};

	this.applyUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
	};

	this.undoUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
	};

	this.objectNormalize = function (trs) {
    delete trs.blockId;
    return trs;
	};

	this.dbRead = function (raw) {
		if (!raw.dvp_countryCode) {
			return null;
		} else {
			var onBehalf = {
        countryCode: raw.dvp_countryCode,
        payFor: raw.dvp_payFor,
        payForCountryCode: raw.dvp_payForCountryCode
      };
			return {onBehalf: onBehalf};
		}
	};

	this.dbSave = function (trs, cb) {
    library.dbLite.query("INSERT INTO onBehalf_doc_verification_payment(countryCode, payFor, payForCountryCode, transactionId) VALUES($countryCode, $payFor, $payForCountryCode, $transactionId)", {
      countryCode: trs.asset && trs.asset.onBehalf && trs.asset.onBehalf.countryCode? trs.asset.onBehalf.countryCode: '',
      payFor: trs.asset.onBehalf.payFor,
      payForCountryCode: trs.asset.onBehalf.payForCountryCode,
      transactionId: trs.id
    }, function(err) {
      library.dbLite.query("INSERT INTO mem_accounts_onBehalf_doc_verification_payment(senderId, senderCountryCode, payFor, payForCountryCode, recipientId, recepientCountryCode, amount, timestamp) VALUES($senderId, $senderCountryCode, $payFor, $payForCountryCode, $recipientId, $recepientCountryCode, $amount, $timestamp)", {
        senderId: trs.senderId,
        senderCountryCode: trs.countryCode,
        payFor: trs.asset.onBehalf.payFor,
        payForCountryCode: trs.asset.onBehalf.payForCountryCode,
        recipientId: trs.recipientId,
        recepientCountryCode: trs.asset.onBehalf.countryCode,
        amount: trs.amount,
        timestamp: slots.getTime()
      }, function(err) {
        var data = {
          address: trs.asset.onBehalf.payFor,
          countryCode: trs.asset.onBehalf.payForCountryCode
        };
        modules.accounts.setAccountAndGet(data, cb);
      });
    });
  };

  this.ready = function (trs, sender) {
    if (sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }
      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}
function Storage() {
  this.create = function (data, trs) {
    trs.asset.storage = {
      content: Buffer.isBuffer(data.content) ? data.content.toString('hex') : data.content
    }

    return trs;
  }

  this.calculateFee = function (trs, sender) {
    var binary = Buffer.from(trs.asset.storage.content, 'hex');
    return (Math.floor(binary.length / 200) + 1) * library.base.block.calculateFee();
  }

  this.verify = function (trs, sender, cb) {
    if (!trs.asset.storage || !trs.asset.storage.content) {
      return cb('Invalid transaction asset');
    }
    if (new Buffer(trs.asset.storage.content, 'hex').length > 4096) {
      return cb('Invalid storage content size');
    }

    cb(null, trs);
  }

  this.process = function (trs, sender, cb) {
    setImmediate(cb, null, trs);
  }

  this.getBytes = function (trs) {
    return ByteBuffer.fromHex(trs.asset.storage.content).toBuffer();
  }

  this.apply = function (trs, block, sender, cb) {
    setImmediate(cb);
  }

  this.undo = function (trs, block, sender, cb) {
    setImmediate(cb);
  }

  this.applyUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
  }

  this.undoUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
  }

  this.objectNormalize = function (trs) {
    var report = library.scheme.validate(trs.asset.storage, {
      type: "object",
      properties: {
        content: {
          type: "string",
          format: "hex"
        }
      },
      required: ['content']
    });

    if (!report) {
      throw Error('Invalid storage parameters: ' + library.scheme.getLastError());
    }

    return trs;
  }

  this.dbRead = function (raw) {
    if (!raw.st_content) {
      return null;
    } else {
      var storage = {
        content: raw.st_content
      }

      return { storage: storage };
    }
  }

  this.dbSave = function (trs, cb) {
    try {
      var content = new Buffer(trs.asset.storage.content, 'hex');
    } catch (e) {
      return cb(e.toString())
    }

    library.dbLite.query("INSERT INTO storages(transactionId, content) VALUES($transactionId, $content)", {
      transactionId: trs.id,
      content: content
    }, cb);
  }

  this.ready = function (trs, sender) {
    if (sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }

      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

function Lock() {
  this.create = function (data, trs) {
    trs.args = data.args

    return trs;
  }

  this.calculateFee = function (trs, sender) {
    return library.base.block.calculateFee();
  }

  this.verify = function (trs, sender, cb) {
    if (trs.args.length > 1) return cb('Invalid args length')
    if (trs.args[0].length > 50) return cb('Invalid lock height')
    var lockHeight = Number(trs.args[0])

    var lastBlock = modules.blocks.getLastBlock()

    if (isNaN(lockHeight) || lockHeight <= lastBlock.height) return cb('Invalid lock height')
    if (global.featureSwitch.enableLockReset){
      if (sender.lockHeight && lastBlock.height + 1 <= sender.lockHeight && lockHeight <= sender.lockHeight) return cb('Account is already locked at height ' + sender.lockHeight)
    } else {
      if (sender.lockHeight && lastBlock.height + 1 <= sender.lockHeight) return cb('Account is already locked at height ' + sender.lockHeight)
    }

    cb(null, trs);
  }

  this.process = function (trs, sender, cb) {
    setImmediate(cb, null, trs);
  }

  this.getBytes = function (trs) {
    return null
  }

  this.apply = function (trs, block, sender, cb) {
    library.base.account.set(sender.address, { u_multimin: sender.lockHeight }, function (err) {
      if (err) return cb('Failed to backup lockHeight')
      library.base.account.set(sender.address, { lockHeight: Number(trs.args[0]) }, cb)
    })
  }

  this.undo = function (trs, block, sender, cb) {
    library.logger.warn('undo lock height');
    library.base.account.set(sender.address, { lockHeight: sender.u_multimin }, cb)
  }

  this.applyUnconfirmed = function (trs, sender, cb) {
    var key = sender.address + ':' + trs.type
    if (library.oneoff.has(key)) {
      return setImmediate(cb, 'Double submit')
    }
    library.oneoff.set(key, true)
    setImmediate(cb)
  }

  this.undoUnconfirmed = function (trs, sender, cb) {
    var key = sender.address + ':' + trs.type
    library.oneoff.delete(key)
    setImmediate(cb)
  }

  this.objectNormalize = function (trs) {
    return trs;
  }

  this.dbRead = function (raw) {
    return null;
  }

  this.dbSave = function (trs, cb) {
    setImmediate(cb);
  }

  this.ready = function (trs, sender) {
    if (sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }

      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

// Constructor
function Transactions(cb, scope) {
  library = scope;
  genesisblock = library.genesisblock;
  self = this;
  self.__private = private;
  private.attachApi();

  library.base.transaction.attachAssetType(TransactionTypes.SEND, new Transfer());
  library.base.transaction.attachAssetType(TransactionTypes.DOCUMENT_VERIFICATION_TRS, new InitialTransfer());  
  library.base.transaction.attachAssetType(TransactionTypes.STORAGE, new Storage());
  library.base.transaction.attachAssetType(TransactionTypes.LOCK, new Lock());
  library.base.transaction.attachAssetType(TransactionTypes.ONBEHALF_PAYMENT_FOR_DOC_VERIFICATION, new OnBehalfPaymentForDocVerification());

  setImmediate(cb, null, self);
}

// Private methods
private.attachApi = function () {
  var router = new Router();

  router.use(function (req, res, next) {
    if (modules) return next();
    res.status(500).send({ success: false, error: "Blockchain is loading" });
  });

  router.map(shared, {
    "get /": "getTransactions",
    "get /get": "getTransaction",
    "get /unconfirmed/get": "getUnconfirmedTransaction",
    "get /unconfirmed": "getUnconfirmedTransactions",
    "put /": "addTransactions",
    'put /verify/account': 'verifyAccount',
    'put /disable/account': 'disableAccount',
    "get /multi": "getTransactionsMulti",
    "get /status/multi": "getTransactionsStatus",
    "put /attach/wallets": "attachWallets",
    "put /initial": "initialTransactions",
    "get /wallet/info": "getWalletInfo",
    'get /attached/wallets': "getAttachedWallets",
    "put /onBehalf/attach/wallets": "attachWalletsOnBehalf",
    "get /onBehalf/attached/wallets": "getAttachedWalletsOnBehalf",
    "put /onBehalf/doc/veri/payment": "onBehalfDocVerificationPayment",
    "get /onBehalf/doc/veri/payment/get": "getOnBehalfDocVerificationPayment"
  });

  router.use(function (req, res, next) {
    res.status(500).send({ success: false, error: "API endpoint not found" });
  });

  library.network.app.use('/api/transactions', router);
  library.network.app.use(function (err, req, res, next) {
    if (!err) return next();
    library.logger.error(req.url, err.toString());
    res.status(500).send({ success: false, error: err.toString() });
  });

  private.attachStorageApi();
}

private.attachStorageApi = function () {
  var router = new Router();

  router.use(function (req, res, next) {
    if (modules) return next();
    res.status(500).send({ success: false, error: "Blockchain is loading" });
  });

  router.map(shared, {
    "get /get": "getStorage",
    "get /:id": "getStorage",
    "put /": "putStorage"
  });

  router.use(function (req, res, next) {
    res.status(500).send({ success: false, error: "API endpoint not found" });
  });

  library.network.app.use('/api/storages', router);
  library.network.app.use(function (err, req, res, next) {
    if (!err) return next();
    library.logger.error(req.url, err.toString());
    res.status(500).send({ success: false, error: err.toString() });
  });
}

private.list = function (filter, cb) {
  var sortFields = ['t.id', 't.blockId', 't.amount', 't.fee', 't.type', 't.timestamp', 't.senderPublicKey', 't.senderId', 't.recipientId', 't.confirmations', 'b.height'];
  var params = {}, fields_or = [], owner = "";
  if (filter.blockId) {
    fields_or.push('blockId = $blockId')
    params.blockId = filter.blockId;
  }
  if (filter.senderPublicKey) {
    fields_or.push('lower(hex(senderPublicKey)) = $senderPublicKey')
    params.senderPublicKey = filter.senderPublicKey;
  }
  if (filter.senderId) {
    fields_or.push('senderId = $senderId');
    params.senderId = filter.senderId;
  }
  if (filter.recipientId) {
    fields_or.push('recipientId = $recipientId')
    params.recipientId = filter.recipientId;
  }
  if (filter.ownerAddress && filter.ownerPublicKey) {
    owner = '(lower(hex(senderPublicKey)) = $ownerPublicKey or recipientId = $ownerAddress)';
    params.ownerPublicKey = filter.ownerPublicKey;
    params.ownerAddress = filter.ownerAddress;
  } else if (filter.ownerAddress) {
    owner = '(senderId = $ownerAddress or recipientId = $ownerAddress)';
    params.ownerAddress = filter.ownerAddress;
  }
  if (filter.type >= 0) {
    fields_or.push('type = $type');
    params.type = filter.type;
  }
  if (filter.uia) {
    fields_or.push('(type >=9 and type <= 14)')
  }

  if (filter.message) {
    fields_or.push('message = $message')
    params.message = filter.message
  }

  if(filter.fromTimestamp) {
    fields_or.push('t.timestamp >= ' + filter.fromTimestamp);
  }

  if (filter.limit) {
    params.limit = filter.limit;
  } else {
    params.limit = filter.limit = 20;
  }

  if (filter.offset >= 0) {
    params.offset = filter.offset;
  }

  if (filter.orderBy) {
    var sort = filter.orderBy.split(':');
    var sortBy = sort[0].replace(/[^\w_]/gi, '').replace('_', '.');
    if (sort.length == 2) {
      var sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
    } else {
      sortMethod = "desc";
    }
  }

  if (sortBy) {
    if (sortFields.indexOf(sortBy) < 0) {
      return cb("Invalid sort field");
    }
  }

  var uiaCurrencyJoin = ''
  if (filter.currency) {
    uiaCurrencyJoin = 'inner join transfers ut on ut.transactionId = t.id and ut.currency = "' + filter.currency + '" '
  }

  var connector = "or";
  if (filter.and) {
    connector = "and";
  }

  library.dbLite.query("select count(t.id) " +
    "from trs t " +
    "inner join blocks b on t.blockId = b.id " + uiaCurrencyJoin +
    (fields_or.length || owner ? "where " : "") + " " +
    (fields_or.length ? "(" + fields_or.join(' ' + connector + ' ') + ") " : "") + (fields_or.length && owner ? " and " + owner : owner), params, { "count": Number }, function (err, rows) {
      if (err) {
        return cb(err);
      }

      var count = rows.length ? rows[0].count : 0;

      // Need to fix 'or' or 'and' in query
      
      library.dbLite.query("select t.id, b.height, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), t.signatures, t.args, t.message, (select max(height) + 1 from blocks) - b.height " +
        "from trs t " +
        "inner join blocks b on t.blockId = b.id " + uiaCurrencyJoin +
        (fields_or.length || owner ? "where " : "") + " " +
        (fields_or.length ? "(" + fields_or.join(' ' + connector + ' ') + ") " : "") + (fields_or.length && owner ? " and " + owner : owner) + " " +
        (filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
        (filter.limit ? 'limit $limit' : '') + " " +
        (filter.offset ? 'offset $offset' : ''), params, ['t_id', 'b_height', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_signatures', 't_args', 't_message', 'confirmations'], function (err, rows) {
          if (err) {
            return cb(err);
          }

          var transactions = [];
          for (var i = 0; i < rows.length; i++) {
            transactions.push(library.base.transaction.dbRead(rows[i]));
          }
          var data = {
            transactions: transactions,
            count: count
          }
          cb(null, data);
        });
    });
}

shared.getTransactionsMulti = function(req, cb) {
  var query = req.body;
  var filter = {};
  var sortFields = ['id', 'blockId', 'amount', 'fee', 'type', 'timestamp', 'senderPublicKey', 'senderId', 'recipientId', 'confirmations', 'height'];  

  filter.offset = (query && query.offset >= 0)? query.offset: 0;
  filter.limit = (query && query.limit)? query.limit: 20;
  filter.orderBy = (query && query.orderBy)? query.orderBy: null;

  if (query && query.orderBy) {
    var sort = query.orderBy.split(':');
    var sortBy = sort[0].replace(/[^\w_]/gi, '').replace('_', '.');
    if (sort.length == 2) {
      var sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
    } else {
      sortMethod = "desc";
    }
  }

  if (sortBy) {
    if (sortFields.indexOf(sortBy) < 0) {
      return cb("Invalid sort field");
    }
    sortBy = "t." + sortBy;
  }
  
  query.address = (query.address && Array.isArray(query.address))? query.address: [query.address];
  
  library.scheme.validate(query, {
    type: 'object',
    properties: {
      address: {
        type: 'array',
        minLength: 1
      }
    },
    required: ['address']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    var addresses = req.body.address;
    var params = {};
    
    addresses =  addresses.map((address) => "'"+addressHelper.removeCountryCodeFromAddress(address)+"'").join(',');
    
    var countQuery = "SELECT count(id) FROM trs " +
      "WHERE senderId IN (" + addresses + ")" + "or " +
      "recipientId IN (" +addresses+ ") ";

    library.dbLite.query(countQuery, params, { "count": Number }, function (err, rows) {
      if (err) {
        return cb(err);
      }

      var count = rows.length ? rows[0].count : 0;
      
      var query = "select t.id, b.height, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), t.signatures, t.args, t.message, (select max(height) + 1 from blocks) - b.height " +
      "from trs t " +  
      "inner join blocks b on t.blockId = b.id " +
      "where t.senderId IN (" + addresses + ")" + "or " +
      "t.recipientId IN (" +addresses+ ") " +
      (filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
      (filter.limit ? "limit " + filter.limit  : '') + " " +
      (filter.offset ? "offset " + filter.offset  : '');
      
      var cols = ['t_id', 'b_height', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_signatures', 't_args', 't_message', 'confirmations'];
      library.dbLite.query(query, params, cols, function(err, rows) {
        if (err) {
          return cb(err);
        }
        var transactions = [];
        for (var i = 0; i < rows.length; i++) {
          transactions.push(library.base.transaction.dbRead(rows[i]));
        }
        var addr = [];
        transactions.forEach(function(trs, index) {
          if(trs.senderId)
          addr.push(trs.senderId);
          if(trs.recipientId)
          addr.push(trs.recipientId);
        });
        modules.accounts.getAccounts({
          address: {$in: addr}
        }, ['address', "countryCode"], function (err, rows) {
          if (err) {
            return cb("Database error");
          }
          
          rows.forEach(function(row, index1) {
            transactions.forEach(function(trs, index2) {
              if(row.address == trs.senderId) {
                trs.senderCountryCode = row.countryCode;
                trs.senderId = trs.senderId + ((row && row.countryCode)? row.countryCode: '');
              }
              if(row.address == trs.recipientId) {
                trs.recepientCountryCode = row.countryCode;
                trs.recipientId = trs.recipientId + ((row && row.countryCode)? row.countryCode: '');
              }
            });
          });
          cb(null, { transactions: transactions, count: count });
        });
      });
    });
  });
}

shared.getTransactionsStatus = function(req, cb) {
  var query = req.body;

  query.txIds = (query.txIds && Array.isArray(query.txIds))? query.txIds: [query.txIds];

  library.scheme.validate(query, {
    type: 'object',
    properties: {
      address: {
        type: 'array',
        minLength: 1
      }
    },
    required: ['txIds']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    var  txIds =  req.body.txIds.map((txId) => "'"+txId+"'").join(',');
    var query = "select t.id " + 
    "from trs t " +  
    "where t.id IN (" + txIds + ")";
    var transactions = [];
    library.dbLite.query(query, function(err, rows) {
      if (err) {
        return cb("Database error");
      }

      rows =_.flatten(rows);
      req.body.txIds.forEach(function(txId, index) {
        if(private.unconfirmedTransactionsId.indexOf(txId) >=0) {
          transactions.push({txId: txId, status: "PENDING"});
        } else if(rows.indexOf(txId) >= 0) {
          transactions.push({txId: txId, status: "CONFIRMED"});
        } else {
          transactions.push({txId: txId, status: "INVALID"});
        }
      }); 
      cb(null, { transactions: transactions, count: transactions.length });
    });
  });
}

private.getById = function (id, cb) {
  library.dbLite.query("select t.id, b.height, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), t.args, t.message, (select max(height) + 1 from blocks) - b.height " +
    "from trs t " +
    "inner join blocks b on t.blockId = b.id " +
    "where t.id = $id", { id: id }, ['t_id', 'b_height', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_args', 't_message', 'confirmations'], function (err, rows) {
      if (err || !rows.length) {
        return cb(err || "Can't find transaction: " + id);
      }

      var transaction = library.base.transaction.dbRead(rows[0]);
      cb(null, transaction);
    });
}

private.addUnconfirmedTransaction = function (transaction, sender, cb) {
  self.applyUnconfirmed(transaction, sender, function (err) {
    if (err) {
      self.removeUnconfirmedTransaction(transaction.id);
      return setImmediate(cb, err);
    }

    private.unconfirmedTransactions.push(transaction);
    var index = private.unconfirmedTransactions.length - 1;
    private.unconfirmedTransactionsIdIndex[transaction.id] = index;
    private.unconfirmedTransactionsId.push(transaction.id);
    private.unconfirmedNumber++;
    
    setImmediate(cb);
  });
}

// Public methods
Transactions.prototype.getUnconfirmedTransaction = function (id) {
  var index = private.unconfirmedTransactionsIdIndex[id];
  return private.unconfirmedTransactions[index];
}

Transactions.prototype.getUnconfirmedTransactionList = function (reverse, limit) {
  var a = [];

  for (var i = 0; i < private.unconfirmedTransactions.length; i++) {
    if (private.unconfirmedTransactions[i] !== false) {
      a.push(private.unconfirmedTransactions[i]);
    }
  }

  a = reverse ? a.reverse() : a;

  if (limit) {
    a.splice(limit);
  }

  return a;
}

Transactions.prototype.removeUnconfirmedTransaction = function (id) {
  if (private.unconfirmedTransactionsIdIndex[id] == undefined) {
    return
  }
  var index = private.unconfirmedTransactionsIdIndex[id];
  delete private.unconfirmedTransactionsIdIndex[id];
  private.unconfirmedTransactions[index] = false;
  var index = private.unconfirmedTransactionsId.indexOf(id);
  if (index > -1) {
    private.unconfirmedTransactionsId.splice(index, 1);
  }
  private.unconfirmedNumber--;
}

Transactions.prototype.hasUnconfirmedTransaction = function (transaction) {
  var index = private.unconfirmedTransactionsIdIndex[transaction.id];
  return index !== undefined && private.unconfirmedTransactions[index] !== false;
}

private.checkVrificationOnKYCThroughAPI = function(sender, trs, cb) {
	library.logger.info('*********************** Using api to verify the KYC ********************');
  var addresses = [];
  var payload = [];
  var addressWithCountryCode = [];
  
  if(trs.type === TransactionTypes.DOCUMENT_VERIFICATION_TRS) {
    var recipientId = trs.recipientId;
    modules.accounts.getAccount({address : recipientId}, function (err, recipient){
      if(!recipient || recipient.status != 1 || recipient.expDate < new Date().getTime()){
				cb(recipientId + ((recipient && recipient.countryCode)? recipient.countryCode: '') +' wallet is not verified.');
			} else {
				cb();
			}
		});
  } else {
    if(trs.recipientId){
      addresses.push(trs.recipientId);
    }
    addresses.push(sender.address);
    modules.accounts.getAccounts({
      address: {$in: addresses}
    }, ['address', "countryCode"], function (err, rows) {
      if (err) {
        return cb("Database error");
      }
      rows.forEach(function(row, index) {
        addresses.forEach(function(address, index) {
          if(row.address == address) {
            payload.push(address.concat(row.countryCode));
            addressWithCountryCode.push(address.concat(row.countryCode));
          }
        });
      });
      
      if(payload.length !== 0){
        payload = payload.join(',');
        httpCall.call('GET', '/api/v1/accounts/status?walletAddressArray='+payload, null, function(error, result){
          library.logger.info('response from the KYC server: ', result);
          if(!error && result && result.data){
            var errorData;
            addressWithCountryCode.forEach(function(address){
              if(!result.data[address]){
                errorData = address + ' wallet is not verified.';
              }
            })
            cb(errorData);
          } else {
            cb('Something went wrong.');
          }
        });
      } else{
        cb();
      }
    });
  }
};

private.checkVrificationOnKYCWithoutAPI = function(sender, trs, cb) {
	library.logger.info('******************** Using custom field to verify the KYC ************************')
  var recipientId = trs.recipientId;
  
	if (trs.type === TransactionTypes.ENABLE_WALLET_KYC || trs.type === TransactionTypes.ENABLE_WALLET_KYC_ONBEHALF) {
    var addressWithCountryCode = (recipientId)? recipientId.concat(trs.asset.ac_status.countryCode): (sender.address.concat((sender && sender.countryCode)? sender.countryCode: ''));
    httpCall.call('GET', '/api/v1/accounts/status?walletAddressArray='+ addressWithCountryCode, null, function(error, result){
      library.logger.info('response from the KYC server: ', result);
      if(!error && result){
        if(!result.data[addressWithCountryCode]) {
          return cb(addressWithCountryCode + ' wallet is not verified.');
        }
				if((result.data[addressWithCountryCode] && trs.asset.ac_status.status != 1) || (!result.data[addressWithCountryCode] && trs.asset.ac_status.status != 0)) {
          cb('Invalid account status');
				} else  {
					cb();
				}
			} else {
				cb('Something went wrong.');
			}
		});
		//cb();
	} else if(trs.type === TransactionTypes.DISABLE_WALLET_KYC) {
    var addresses = [];
    var payload = [];
    var addressWithCountryCode = [];

    if(trs.recipientId){
      addresses.push(trs.recipientId);
    }
    addresses.push(sender.address);

    modules.accounts.getAccounts({
      address: {$in: addresses}
    }, ['address', "countryCode"], function (err, rows) {
      if (err) {
        return cb("Database error");
      }
      rows.forEach(function(row, index) {
        addresses.forEach(function(address, index) {
          if(row.address == address) {
            payload.push(address.concat(row.countryCode));
            addressWithCountryCode.push(address.concat(row.countryCode));
          }
        });
      });

      httpCall.call('GET', '/api/v1/accounts/status?walletAddressArray='+ addressWithCountryCode, null, function(error, result){
        //result.data['3993821763104859620IN'] = false;
        library.logger.info('response from the KYC server: ', result);
        if(!error && result){
          var errorData;
          addressWithCountryCode.forEach(function(address){
            if((sender.address == addressHelper.removeCountryCodeFromAddress(address)) && !result.data[address]){
              errorData = address + ' wallet is not verified.';
            }
            if((trs.recipientId == addressHelper.removeCountryCodeFromAddress(address)) && result.data[address]) {
              errorData = address + ' wallet is verified.'
            }
          });
          cb(errorData);
        } else {
          cb('Something went wrong.');
        }
      });
    });
  } else if(trs.type === TransactionTypes.DOCUMENT_VERIFICATION_TRS) {
    modules.accounts.getAccount({address : recipientId}, function (err, recipient){
      if(!recipient || recipient.status != 1 || recipient.expDate < new Date().getTime()){
				cb(recipientId + ((recipient && recipient.countryCode)? recipient.countryCode: '') +' wallet is not verified.');
			} else {
				cb();
			}
		});
  } else if(trs.type == TransactionTypes.OUT_TRANSFER) {
    library.logger.info("PASS OutTransfer TransactionTypes");
    cb();
  } else if(!recipientId && sender.status == 1 && sender.expDate >= new Date().getTime()) {
		cb();
	} else if((sender.status != 1) || sender.expDate < new Date().getTime()){
		cb(sender.address + ((sender && sender.countryCode)? sender.countryCode: '') + ' wallet is not verified.');
  } else {
		modules.accounts.getAccount({address : recipientId}, function (err, row){
      if(!row && trs.type === TransactionTypes.SEND) {
        if(trs.amount > constants.maxDocVerificationAmount * constants.fixedPoint) {
          return cb('You can transfer only 25 BEL to unverified user');
        } 
        cb();
      } else if(row && row.status != 1 && trs.type === TransactionTypes.SEND) {
        library.dbLite.query("SELECT type, amount FROM trs WHERE type='"+trs.type+"' AND recipientId='"+trs.recipientId+"'", {}, ['type', 'amount'], function(err, rows) {
          var amount = 0;
          rows.forEach(function(rowTrs, index) {
            amount += parseInt(rowTrs.amount);
          });
          var totalAmount = amount + trs.amount; 
          if(totalAmount > constants.maxDocVerificationAmount * constants.fixedPoint) {
            return cb('transfer amount exceeds, your amount transfer remaining: '+ (constants.maxDocVerificationAmount * constants.fixedPoint - amount));
          }
          cb();          
        });
      } else if(!row || row.status != 1 || row.expDate < new Date().getTime()){
				cb(recipientId + ((row && row.countryCode)? row.countryCode: '') +' wallet is not verified.');
			} else {
				cb();
			}
		});
	}
};

Transactions.prototype.processUnconfirmedTransaction = function (transaction, broadcast, cb) {
  console.log("ReceiveTransaction: ", transaction);
  if (!transaction) {
    return cb("No transaction to process!");
  }
  if (!transaction.id) {
    transaction.id = library.base.transaction.getId(transaction);
  }
  if (!global.featureSwitch.enableUIA && transaction.type >= 8 && transaction.type <= 14) {
    return cb("Feature not activated");
  }
  if (!global.featureSwitch.enable1_3_0 && ([5, 6, 7, 100].indexOf(transaction.type) !== -1 || transaction.message || transaction.args)) {
    return cb("Feature not activated");
  }
  // Check transaction indexes
  if (private.unconfirmedTransactionsIdIndex[transaction.id] !== undefined) {
    return cb("Transaction " + transaction.id + " already exists, ignoring...");
  }
  var data = { publicKey: transaction.senderPublicKey};

  if(transaction.countryCode) {
    data.countryCode = transaction.countryCode
  }
  console.log("data: ", data);
  modules.accounts.setAccountAndGet(data, function (err, sender) {
    function done(err) {
      if (err) {
        return cb(err);
      }

      private.addUnconfirmedTransaction(transaction, sender, function (err) {
        
        if (err) {
          return cb(err);
        }
        
        library.bus.message('unconfirmedTransaction', transaction, broadcast);

        cb();
      });
    }

    if (err) {
      return done(err);
    }

    var kycCheck = {};
    kycCheck.api = (library.config.walletVerificationAPI.enable) ? private.checkVrificationOnKYCThroughAPI : private.checkVrificationOnKYCWithoutAPI;

    kycCheck.api.call(this, sender, transaction, function (err) {
      if(err){
        return cb(err);
      } else {
        if (transaction.requesterPublicKey && sender && sender.multisignatures && sender.multisignatures.length) {
          modules.accounts.getAccount({ publicKey: transaction.requesterPublicKey }, function (err, requester) {
            if (err) {
              return done(err);
            }

            if (!requester) {
              return cb("Invalid requester");
            }

            library.base.transaction.process(transaction, sender, requester, function (err, transaction) {
              if (err) {
                return done(err);
              }

              library.base.transaction.verify(transaction, sender, done);
            });
          });
        } else {
          library.base.transaction.process(transaction, sender, function (err, transaction) {
            if (err) {
              return done(err);
            }

            library.base.transaction.verify(transaction, sender, done);
          });
        }
      }
    });
  });
}

Transactions.prototype.applyUnconfirmedList = function (ids, cb) {
  async.eachSeries(ids, function (id, cb) {
    var transaction = self.getUnconfirmedTransaction(id);
    modules.accounts.setAccountAndGet({ publicKey: transaction.senderPublicKey }, function (err, sender) {
      if (err) {
        self.removeUnconfirmedTransaction(id);
        return setImmediate(cb);
      }
      self.applyUnconfirmed(transaction, sender, function (err) {
        if (err) {
          self.removeUnconfirmedTransaction(id);
        }
        setImmediate(cb);
      });
    });
  }, cb);
}

Transactions.prototype.undoUnconfirmedList = function (cb) {
  var ids = [];
  async.eachSeries(private.unconfirmedTransactions, function (transaction, cb) {
    if (transaction !== false) {
      ids.push(transaction.id);
      self.undoUnconfirmed(transaction, cb);
    } else {
      setImmediate(cb);
    }
  }, function (err) {
    cb(err, ids);
  })
}

Transactions.prototype.apply = function (transaction, block, sender, cb) {
  library.base.transaction.apply(transaction, block, sender, cb);
}

Transactions.prototype.undo = function (transaction, block, sender, cb) {
  library.base.transaction.undo(transaction, block, sender, cb);
}

Transactions.prototype.applyUnconfirmed = function (transaction, sender, cb) {
  if (!sender && transaction.blockId != genesisblock.block.id) {
    return cb("Invalid block id");
  } else {
    if (transaction.requesterPublicKey) {
      modules.accounts.getAccount({ publicKey: transaction.requesterPublicKey }, function (err, requester) {
        if (err) {
          return cb(err);
        }

        if (!requester) {
          return cb("Invalid requester");
        }

        library.base.transaction.applyUnconfirmed(transaction, sender, requester, cb);
      });
    } else {
      library.base.transaction.applyUnconfirmed(transaction, sender, cb);
    }
  }
}

Transactions.prototype.undoUnconfirmed = function (transaction, cb) {
  modules.accounts.getAccount({ publicKey: transaction.senderPublicKey }, function (err, sender) {
    if (err) {
      return cb(err);
    }
    self.removeUnconfirmedTransaction(transaction.id)
    library.base.transaction.undoUnconfirmed(transaction, sender, cb);
  });
}

Transactions.prototype.receiveTransactions = function (transactions, cb) {

  if (private.unconfirmedNumber > constants.maxTxsPerBlock) {
    setImmediate(cb, "Too many transactions");
    return;
  }
  async.eachSeries(transactions, function (transaction, next) {
    self.processUnconfirmedTransaction(transaction, true, next);
  }, function (err) {
    cb(err, transactions);
  });
}

Transactions.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(shared, call, args, cb);
}

Transactions.prototype.list = function (query, cb) {
  private.list(query, cb)
}

Transactions.prototype.getById = function (id, cb) {
  private.getById(id, cb)
}

// Events
Transactions.prototype.onBind = function (scope) {
  modules = scope;
}

// Shared
shared.getTransactions = function (req, cb) {
  var query = req.body;
  library.scheme.validate(query, {
    type: "object",
    properties: {
      blockId: {
        type: "string"
      },
      limit: {
        type: "integer",
        minimum: 0,
        maximum: 100
      },
      type: {
        type: "integer",
        minimum: 0,
        maximum: 100
      },
      orderBy: {
        type: "string"
      },
      offset: {
        type: "integer",
        minimum: 0
      },
      senderPublicKey: {
        type: "string",
        format: "publicKey"
      },
      ownerPublicKey: {
        type: "string",
        format: "publicKey"
      },
      ownerAddress: {
        type: "string"
      },
      senderId: {
        type: "string"
      },
      recipientId: {
        type: "string"
      },
      amount: {
        type: "integer",
        minimum: 0,
        maximum: constants.fixedPoint
      },
      fee: {
        type: "integer",
        minimum: 0,
        maximum: constants.fixedPoint
      },
      uia: {
        type: "integer",
        minimum: 0,
        maximum: 1
      },
      currency: {
        type: "string",
        minimum: 1,
        maximum: 22
      },
      and:{
        type:"integer",
        minimum: 0,
        maximum: 1
      },
      fromTimestamp: {
        type: "integer",
        minimum: 0
      }
    }
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }
   if(query.senderId) {
    query.senderId = addressHelper.removeCountryCodeFromAddress(query.senderId);
   }
   if(query.recipientId) {
    query.recipientId = addressHelper.removeCountryCodeFromAddress(query.recipientId);
   }
    private.list(query, function (err, data) {
      var addresses = [];
      if (err) {
        return cb("Failed to get transactions");
      }
      data.transactions.forEach(function(trs, index) {
        if(trs.senderId)
        addresses.push(trs.senderId);
        if(trs.recipientId)
        addresses.push(trs.recipientId);
      });
      modules.accounts.getAccounts({
        address: {$in: addresses}
      }, ['address', "countryCode"], function (err, rows) {
        if (err) {
          return cb("Database error");
        }
        
        rows.forEach(function(row, index1) {
          data.transactions.forEach(function(trs, index2) {
            if(row.address == trs.senderId) {
              trs.senderCountryCode = row.countryCode;
              trs.senderId = trs.senderId + ((row && row.countryCode)? row.countryCode: '');
            }
            if(row.address == trs.recipientId) {
              trs.recepientCountryCode = row.countryCode;
              trs.recipientId = trs.recipientId + ((row && row.countryCode)? row.countryCode: '');
            }
          });
        });
        cb(null, { transactions: data.transactions, count: data.count });
      });
    });
  });
}

shared.getTransaction = function (req, cb) {
  var query = req.body;
  library.scheme.validate(query, {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['id']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    private.getById(query.id, function (err, transaction) {
      if(transaction) {
        modules.accounts.getAccount({address: transaction.senderId}, function(err, sender) {
          transaction.senderId = transaction.senderId + ((sender && sender.countryCode)? sender.countryCode: '');
          modules.accounts.getAccount({address: transaction.recipientId}, function(err, recipient) {
            transaction.recipientId = transaction.recipientId + ((recipient && recipient.countryCode)? recipient.countryCode: '');
            if (!transaction || err) {
              return cb("Transaction not found");
            }
            cb(null, { transaction: transaction });
          });
        });
      } else {
        return cb("Transaction not found");
      }
    });
  });
}

shared.getOnBehalfDocVerificationPayment = function (req, cb) {
  var query = req.body;
  library.scheme.validate(query, {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        minLength: 1
      },
      limit: {
        type: "integer",
        minimum: 0,
        maximum: 100
      },
      offset: {
        type: "integer",
        minimum: 0
      }
    },
    required: ['address']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }
    var conCode = addressHelper.getCountryCodeFromAddress(query.address);
    query.address = addressHelper.removeCountryCodeFromAddress(query.address);
    modules.accounts.getAccount({address: query.address}, function(err, account) {
      if(err) {
        return cb(err);
      }
      if(!account) {
        return cb('account not found!');
      }
      if(conCode != account.countryCode) {
        return cb('country code mismatched'); 
      }
      
      var filter = "";
      if(req.body.limit) {
        filter += " limit " +req.body.limit
      }
      if(req.body.offset) {
        filter += " offset " +req.body.offset;
      }
      library.dbLite.query("SELECT count(*) FROM mem_accounts_onBehalf_doc_verification_payment WHERE senderId=" + "'"+query.address+"'", {}, ['count'], function(err, row) {
        var count = row[0].count;
        var queryString = "SELECT * FROM mem_accounts_onBehalf_doc_verification_payment WHERE senderId=" + "'"+query.address+"'" + filter;
        params = {};
        fields = ["senderId", "senderCountryCode", "payFor", "payForCountryCode", "recipientId", "recepientCountryCode", "amount", "timestamp"];
        library.dbLite.query(queryString, params, fields, function(err, rows) {
          rows.forEach(function(row) {
            row.senderId = row.senderId.concat(row.senderCountryCode);
            row.payFor = row.payFor.concat(row.payForCountryCode);
            row.recipientId = row.recipientId.concat(row.recepientCountryCode);
          });
          cb(null, { data: rows, count: count });
        });
      });
    });
  });
}

shared.getUnconfirmedTransaction = function (req, cb) {
  var query = req.body;
  library.scheme.validate(query, {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        minLength: 1,
        maxLength: 64
      }
    },
    required: ['id']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    var unconfirmedTransaction = self.getUnconfirmedTransaction(query.id);

    if (!unconfirmedTransaction) {
      return cb("Transaction not found");
    }

    modules.accounts.getAccount({address: unconfirmedTransaction.senderId}, function(err, sender) {
      unconfirmedTransaction.senderId = unconfirmedTransaction.senderId + ((sender && sender.countryCode)? sender.countryCode: '');
      modules.accounts.getAccount({address: unconfirmedTransaction.recipientId}, function(err, recipient) {
        unconfirmedTransaction.recipientId = unconfirmedTransaction.recipientId + ((recipient && recipient.countryCode)? recipient.countryCode: '');
        cb(null, { transaction: unconfirmedTransaction });
      });
    });    
  });
}

shared.getUnconfirmedTransactions = function (req, cb) {
  var query = req.body;
  library.scheme.validate(query, {
    type: "object",
    properties: {
      senderPublicKey: {
        type: "string",
        format: "publicKey"
      },
      address: {
        type: "string"
      }
    }
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    var transactions = self.getUnconfirmedTransactionList(true),
      toSend = [];

    if (query.senderPublicKey || query.address) {
      for (var i = 0; i < transactions.length; i++) {
        if (transactions[i].senderPublicKey == query.senderPublicKey || transactions[i].recipientId == query.address) {
          toSend.push(transactions[i]);
        }
      }
    } else {
      for (var i = 0; i < transactions.length; i++) {
        toSend.push(transactions[i]);
      }
    }

    var addresses = [];
    toSend.forEach(function(trs, index) {
      if(trs.senderId)
      addresses.push(trs.senderId);
      if(trs.recipientId)
      addresses.push(trs.recipientId);
    });
    modules.accounts.getAccounts({
      address: {$in: addresses}
    }, ['address', "countryCode"], function (err, rows) {
      if (err) {
        return cb("Database error");
      }
      rows.forEach(function(row, index1) {
        toSend.forEach(function(trs, index2) {
          if(row.address == trs.senderId) {
            trs.senderCountryCode = row.countryCode;
            trs.senderId = trs.senderId + ((row && row.countryCode)? row.countryCode: '');
          }
          if(row.address == trs.recipientId) {
            trs.recepientCountryCode = row.countryCode;
            trs.recipientId = trs.recipientId + ((row && row.countryCode)? row.countryCode: '');
          }
        });
      });
      cb(null, { transactions: toSend, count: toSend.length });
    });
  });
}

shared.addTransactions = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      amount: {
        type: "integer",
        minimum: 1,
        maximum: constants.totalAmount
      },
      recipientId: {
        type: "string",
        minLength: 1
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      multisigAccountPublicKey: {
        type: "string",
        format: "publicKey"
      },
      message: {
        type: "string",
        maxLength: 256
      },
      senderCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      recepientCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      }
    },
    required: ["secret", "amount", "recipientId", "senderCountryCode", "recepientCountryCode"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }

    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    if (body.publicKey) {
      if (keypair.publicKey.toString('hex') != body.publicKey) {
        return cb("Invalid passphrase");
      }
    }
    var conCode = addressHelper.getCountryCodeFromAddress(body.recipientId);
    var address = addressHelper.removeCountryCodeFromAddress(body.recipientId);
    var query = { address: address };

    library.balancesSequence.add(function (cb) {
      modules.accounts.getAccount(query, function (err, recipient) {
        if (err) {
          return cb(err.toString());
        }
        if(body.recepientCountryCode != conCode) {
          return cb("Recipient country code mismatched!");
        }
        //var recipientId = recipient ? recipient.address : address;
        if(recipient && recipient.countryCode) {
          if(body.recepientCountryCode != recipient.countryCode) {
            return cb("Recipient country code mismatched!");
          }
          if(addressHelper.generateAddressWithCountryCode(recipient.address, recipient.countryCode) != (body.recipientId)) {
            return cb("Recipient Address mismatched!");
          } else {
            recipientId = recipient.address;
          }
        } else {
          recipientId = address;
        }
        if (!recipientId) {
          return cb("Recipient not found");
        }

        if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
          modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
            if (err) {
              return cb(err.toString());
            }

            if (!account) {
              return cb("Multisignature account not found");
            }

            if (!account.multisignatures || !account.multisignatures) {
              return cb("Account does not have multisignatures enabled");
            }

            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
              return cb("Account does not belong to multisignature group");
            }

            modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
              if (err) {
                return cb(err.toString());
              }

              if (!requester || !requester.publicKey) {
                return cb("Invalid requester");
              }

              if (requester.secondSignature && !body.secondSecret) {
                return cb("Invalid second passphrase");
              }

              if (requester.publicKey == account.publicKey) {
                return cb("Invalid requester");
              }

              var secondKeypair = null;

              if (requester.secondSignature) {
                var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                secondKeypair = ed.MakeKeypair(secondHash);
              }

              try {
                var transaction = library.base.transaction.create({
                  type: TransactionTypes.SEND,
                  amount: body.amount,
                  sender: account,
                  recipientId: recipientId,
                  keypair: keypair,
                  requester: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  countryCode: body.senderCountryCode,
                  recepientCountryCode: body.recepientCountryCode
                });
              } catch (e) {
                return cb(e.toString());
              }
              modules.transactions.receiveTransactions([transaction], cb);
            });
          });
        } else {
          modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
            if(account && !account.countryCode) {
              modules.accounts.setAccountAndGet({ publicKey: keypair.publicKey.toString('hex'), countryCode: body.senderCountryCode }, function (err, account) {
                library.logger.debug('=========================== after setAccountAndGet ==========================');
                address = modules.accounts.generateAddressByPublicKey2(keypair.publicKey.toString('hex'))
                if (!account) {
                  return cb("Account not found");
                }
                if(account.countryCode != body.senderCountryCode) {
                  return cb("Account country code mismatched!");
                }
                if(addressHelper.generateAddressWithCountryCode(account.address, account.countryCode) != addressHelper.generateAddressWithCountryCode(address, body.senderCountryCode)) {
                  return cb("Account Address mismatched!");
                }
                if (err) {
                  return cb(err.toString());
                }
    
                if (account.secondSignature && !body.secondSecret) {
                  return cb("Invalid second passphrase");
                }
    
                var secondKeypair = null;
    
                if (account.secondSignature) {
                  var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                  secondKeypair = ed.MakeKeypair(secondHash);
                }
    
                try {
                  var transaction = library.base.transaction.create({
                    type: TransactionTypes.SEND,
                    amount: body.amount,
                    sender: account,
                    recipientId: recipientId,
                    keypair: keypair,
                    secondKeypair: secondKeypair,
                    message: body.message,
                    countryCode: body.senderCountryCode,
                    recepientCountryCode: body.recepientCountryCode
                  });
                } catch (e) {
                  return cb(e.toString());
                }
                modules.transactions.receiveTransactions([transaction], cb);
              });
            } else {
              library.logger.debug('=========================== after getAccount ==========================');
                address = modules.accounts.generateAddressByPublicKey2(keypair.publicKey.toString('hex'));
                if (err) {
                  return cb(err.toString());
                }
                if (!account) {
                  return cb("Account not found");
                }
                //if(account.countryCode) {
                  if(account.countryCode != body.senderCountryCode) {
                    return cb("Account country code mismatched!");
                  }
                  if(addressHelper.generateAddressWithCountryCode(account.address, account.countryCode) != addressHelper.generateAddressWithCountryCode(address, body.senderCountryCode)) {
                    return cb("Account Address mismatched!");
                  }
                //}
                if (account.secondSignature && !body.secondSecret) {
                  return cb("Invalid second passphrase");
                }
    
                var secondKeypair = null;
    
                if (account.secondSignature) {
                  var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                  secondKeypair = ed.MakeKeypair(secondHash);
                }
    
                try {
                  var transaction = library.base.transaction.create({
                    type: TransactionTypes.SEND,
                    amount: body.amount,
                    sender: account,
                    recipientId: recipientId,
                    keypair: keypair,
                    secondKeypair: secondKeypair,
                    message: body.message,
                    countryCode: body.senderCountryCode,
                    recepientCountryCode: body.recepientCountryCode
                  });
                } catch (e) {
                  return cb(e.toString());
                }
                modules.transactions.receiveTransactions([transaction], cb);
            }
          });
        }
      });
    }, function (err, transaction) {
      if (err) {
        return cb(err.toString());
      }

      cb(null, { transactionId: transaction[0].id });
    });
  });
}

shared.verifyAccount = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      status: {
        type: "integer",
        minimum: 0,
        maximum: 1
      },
      countryCode: {
        type: "string",
        maxLength: 2
      }
    },
    required: ["secret", "countryCode", "status"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }

    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    if (body.publicKey) {
      if (keypair.publicKey.toString('hex') != body.publicKey) {
        return cb("Invalid passphrase");
      }
    }

    if (body.status != 1) {
			return cb('Invalid status');
    }
    
    if(!body.expDate) {
      body.expDate = new Date(new Date().setFullYear(new Date().getFullYear() + constants.expDateOfKYC)).getTime();
    }
    
    if(isNaN(body.expDate.valueOf())) {
      return cb('Invalid date formate');
    }

    if(body.expDate < new Date().getTime()) {
      return cb('Invalid date, expiry date should be greater than today date');
    }
    
    library.balancesSequence.add(function (cb) {
        if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
          modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
            if (err) {
              return cb(err.toString());
            }

            if (!account) {
              return cb("Multisignature account not found");
            }

            if (!account.multisignatures || !account.multisignatures) {
              return cb("Account does not have multisignatures enabled");
            }

            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
              return cb("Account does not belong to multisignature group");
            }

            modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
              if (err) {
                return cb(err.toString());
              }

              if (!requester || !requester.publicKey) {
                return cb("Invalid requester");
              }

              if (requester.secondSignature && !body.secondSecret) {
                return cb("Invalid second passphrase");
              }

              if (requester.publicKey == account.publicKey) {
                return cb("Invalid requester");
              }

              var secondKeypair = null;

              if (requester.secondSignature) {
                var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                secondKeypair = ed.MakeKeypair(secondHash);
              }

              try {
                var transaction = library.base.transaction.create({
                  type: TransactionTypes.ENABLE_WALLET_KYC,
                  amount: 0,
                  status: body.status,
                  sender: account,
                  keypair: keypair,
                  requester: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  expDate: body.expDate,
                  countryCode: body.countryCode
                });
              } catch (e) {
                return cb(e.toString());
              }
              modules.transactions.receiveTransactions([transaction], cb);
            });
          });
        } else {
          modules.accounts.setAccountAndGet({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
            library.logger.debug('=========================== after getAccount ==========================');
            if (err) {
              return cb(err.toString());
            }
            if (!account) {
              return cb("Account not found");
            }
            /*if(account.countryCode != body.countryCode) {
              return cb("Account country code mismatched!");
            }*/
            if(account.status) {
              return cb('account already verified');
            }
            if (account.secondSignature && !body.secondSecret) {
              return cb("Invalid second passphrase");
            }

            var secondKeypair = null;

            if (account.secondSignature) {
              var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
              secondKeypair = ed.MakeKeypair(secondHash);
            }

            try {
              var transaction = library.base.transaction.create({
                type: TransactionTypes.ENABLE_WALLET_KYC,
                amount: 0,
                status: body.status,
                sender: account,
                keypair: keypair,
                secondKeypair: secondKeypair,
                message: body.message,
                expDate: body.expDate,
                countryCode: body.countryCode
              });
            } catch (e) {
              return cb(e.toString());
            }
            modules.transactions.receiveTransactions([transaction], cb);
          });
        }
    }, function (err, transaction) {
      if (err) {
        return cb(err.toString());
      }

      cb(null, { transactionId: transaction[0].id });
    });
  });
}

shared.disableAccount = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      status: {
        type: "integer",
        minimum: 0,
        maximum: 1
      },
      recipientId: {
        type: "string",
        minLength: 1
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      message: {
        type: "string",
        maxLength: 256
      },
      senderCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      recepientCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      currency: {
        type: "string",
        minLength: 2
      }
    },
    required: ["secret", "status", "recipientId", "senderCountryCode", "recepientCountryCode", "currency"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }

    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    if (body.publicKey) {
      if (keypair.publicKey.toString('hex') != body.publicKey) {
        return cb("Invalid passphrase");
      }
    }

    if (body.status != 0) {
			return cb('Invalid status');
    }

    //if(body.currency == 'BEL') {
      var conCode = addressHelper.getCountryCodeFromAddress(body.recipientId);
      var recipientId = addressHelper.removeCountryCodeFromAddress(body.recipientId);
      if(body.recepientCountryCode != conCode) {
        return cb("Recipient country code mismatched!");
      }
    /*} else {
      var recipientId = body.recipientId;
    }*/
    var query = { address: recipientId };
    
    library.balancesSequence.add(function (cb) {
      modules.accounts.getAccount(query, function (err, recipient) {
        
        if (err) {
          return cb(err.toString());
        }
        
        /*if (body.currency == 'BEL' && !recipient) {
          return cb("Recipient not found");
        }*/

        if(body.currency == 'BEL' && recipient && recipient.countryCode) {
          if(body.recepientCountryCode != recipient.countryCode) {
            return cb("Recipient country code mismatched!");
          }
        }
      
        if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
          modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
            if (err) {
              return cb(err.toString());
            }

            if (!account) {
              return cb("Multisignature account not found");
            }

            if (!account.multisignatures || !account.multisignatures) {
              return cb("Account does not have multisignatures enabled");
            }

            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
              return cb("Account does not belong to multisignature group");
            }

            modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
              if (err) {
                return cb(err.toString());
              }

              if (!requester || !requester.publicKey) {
                return cb("Invalid requester");
              }

              if (requester.secondSignature && !body.secondSecret) {
                return cb("Invalid second passphrase");
              }

              if (requester.publicKey == account.publicKey) {
                return cb("Invalid requester");
              }

              var secondKeypair = null;

              if (requester.secondSignature) {
                var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                secondKeypair = ed.MakeKeypair(secondHash);
              }

              try {
                var transaction = library.base.transaction.create({
                  type: TransactionTypes.DISABLE_WALLET_KYC,
                  sender: account,
                  status: body.status,
                  recipientId: recipientId,
                  keypair: keypair,
                  requester: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  countryCode: body.senderCountryCode
                });
              } catch (e) {
                return cb(e.toString());
              }
              modules.transactions.receiveTransactions([transaction], cb);
            });
          });
        } else {
          modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
            library.logger.debug('=========================== after getAccount ==========================');
              address = modules.accounts.generateAddressByPublicKey2(keypair.publicKey.toString('hex'));
              if (err) {
                return cb(err.toString());
              }
              if (!account) {
                return cb("Account not found");
              }
              if(account.countryCode != body.senderCountryCode) {
                return cb("Account country code mismatched!");
              }
              if(addressHelper.generateAddressWithCountryCode(account.address, account.countryCode) != addressHelper.generateAddressWithCountryCode(address, body.senderCountryCode)) {
                return cb("Account Address mismatched!");
              }
              if (account.secondSignature && !body.secondSecret) {
                return cb("Invalid second passphrase");
              }
  
              var secondKeypair = null;
  
              if (account.secondSignature) {
                var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                secondKeypair = ed.MakeKeypair(secondHash);
              }
  
              try {
                var transaction = library.base.transaction.create({
                  type: TransactionTypes.DISABLE_WALLET_KYC,
                  sender: account,
                  status: body.status,
                  recipientId: recipientId,
                  keypair: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  countryCode: body.senderCountryCode
                });
              } catch (e) {
                return cb(e.toString());
              }
              modules.transactions.receiveTransactions([transaction], cb);
          });
        }
      });
    }, function (err, transaction) {
      if (err) {
        return cb(err.toString());
      }

      cb(null, { transactionId: transaction[0].id });
    });
  });
}

shared.putStorage = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      multisigAccountPublicKey: {
        type: "string",
        format: "publicKey"
      },
      content: {
        type: "string",
        minLength: 1,
        maxLength: 4096,
      },
      encode: {
        type: "string",
        minLength: 1,
        maxLength: 10
      },
      wait: {
        type: "integer",
        minimum: 0,
        maximum: 6
      }
    },
    required: ["secret", "content"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }
    var encode = body.encode;
    if (!encode) {
      encode = 'raw';
    }
    if (encode != 'raw' && encode != 'base64' && encode != 'hex') {
      return cb('Invalide content encode type');
    }
    var content;
    if (encode != 'raw') {
      try {
        content = new Buffer(body.content, encode);
      } catch (e) {
        return cb('Invalid content format with encode type ' + encode);
      }
    } else {
      content = new Buffer(body.content);
    }

    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    library.balancesSequence.add(function (cb) {
      if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
        modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
          if (err) {
            return cb(err.toString());
          }

          if (!account) {
            return cb("Multisignature account not found");
          }

          if (!account.multisignatures || !account.multisignatures) {
            return cb("Account does not have multisignatures enabled");
          }

          if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
            return cb("Account does not belong to multisignature group");
          }

          modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
            if (err) {
              return cb(err.toString());
            }

            if (!requester || !requester.publicKey) {
              return cb("Invalid requester");
            }

            if (requester.secondSignature && !body.secondSecret) {
              return cb("Invalid second passphrase");
            }

            if (requester.publicKey == account.publicKey) {
              return cb("Invalid requester");
            }

            var secondKeypair = null;

            if (requester.secondSignature) {
              var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
              secondKeypair = ed.MakeKeypair(secondHash);
            }

            try {
              var transaction = library.base.transaction.create({
                type: TransactionTypes.STORAGE,
                sender: account,
                keypair: keypair,
                requester: keypair,
                secondKeypair: secondKeypair,
                content: content
              });
            } catch (e) {
              return cb(e.toString());
            }
            modules.transactions.receiveTransactions([transaction], cb);
          });
        });
      } else {
        modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
          if (err) {
            return cb(err.toString());
          }
          if (!account) {
            return cb("Account not found");
          }

          if (account.secondSignature && !body.secondSecret) {
            return cb("Invalid second passphrase");
          }

          var secondKeypair = null;

          if (account.secondSignature) {
            var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
            secondKeypair = ed.MakeKeypair(secondHash);
          }

          try {
            var transaction = library.base.transaction.create({
              type: TransactionTypes.STORAGE,
              sender: account,
              keypair: keypair,
              secondKeypair: secondKeypair,
              content: content
            });
          } catch (e) {
            return cb(e.toString());
          }
          modules.transactions.receiveTransactions([transaction], cb);
        });
      }
    }, function (err, transaction) {
      if (err) {
        return cb(err.toString());
      }
      // if (!body.wait) {
      if (1 === 1) {
        return cb(null, { transactionId: transaction[0].id });
      }

      var confirms = 0;
      function onConfirmed() {
        if (++confirms >= body.wait) {
          library.bus.removeListener('newBlock', onConfirmed);
          cb(null, { transactionId: transaction[0].id });
        }
      }
      library.bus.on('newBlock', onConfirmed);
    });
  });
}

shared.getStorage = function (req, cb) {
  var query;
  if (req.body && req.body.id) {
    query = req.body;
  } else if (req.params && req.params.id) {
    query = req.params;
  }
  library.scheme.validate(query, {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['id']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    library.dbLite.query("select t.id, b.height, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), " +
      "t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
      "lower(hex(st.content)), " +
      "(select max(height) + 1 from blocks) - b.height " +
      "from trs t " +
      "inner join blocks b on t.blockId = b.id " +
      "inner join storages st on st.transactionId = t.id " +
      "where t.id = $id",
      { id: query.id },
      [
        't_id', 'b_height', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey',
        't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
        'st_content', 'confirmations'
      ],
      function (err, rows) {
        if (err || !rows.length) {
          return cb(err || "Can't find transaction: " + query.id);
        }

        var transacton = library.base.transaction.dbRead(rows[0]);
        cb(null, transacton);
      });
  });
}

shared.attachWallets = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      multisigAccountPublicKey: {
        type: "string",
        format: "publicKey"
      },
      message: {
        type: "string",
        maxLength: 256
      },
      countryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      whiteList: {
        type: "array",
        minLength: 1
      },
      currencyType: {
        type: "string",
        minLength: 1
      }
    },
    required: ["secret", "countryCode", "whiteList", "currencyType"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }

    body.currencyType = body.currencyType.toUpperCase();
    
    if(!body.whiteList.length) {
      return cb("WhiteList atleast 1 wallet");
    }
    if(body.whiteList.length > constants.maxWhiteListWallets) {
      return cb("You can whiteList maximum 10 wallets at a time.");
    }
    if(body.currencyType == 'BEL') {
      async.eachSeries(body.whiteList, function (list, cb) {
        if(!addressHelper.isAddress(list.address.slice(0, -2))) {
          return cb("Wrong address found: " + list.address);
        }
        if(body.countryCode != addressHelper.getCountryCodeFromAddress(list.address)) {
          return cb("You are trying to attach adddress of diffrent country: " + list.address);
        }
        list.address = addressHelper.removeCountryCodeFromAddress(list.address);
        list.currency = list.currency.toUpperCase();
        if(list.currency != 'BEL') {
          return cb("you can attach only BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        private.attachWallets(body, cb);
      });
    } else if(body.currencyType == 'NON-BEL') {
      async.eachSeries(body.whiteList, function (list, cb) {
        list.currency = list.currency.toUpperCase();
        if(list.currency == 'BEL') {
          return cb("you can attach only NON-BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        private.attachWallets(body, cb);
      });
    } else {
      return cb("currencyType must be BEL or NON-BEL");
    }
  });
}

shared.initialTransactions = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      amount: {
        type: "integer",
        minimum: 1,
        maximum: constants.totalAmount
      },
      recipientId: {
        type: "string",
        minLength: 1
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      multisigAccountPublicKey: {
        type: "string",
        format: "publicKey"
      },
      message: {
        type: "string",
        maxLength: 256
      },
      senderCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      recepientCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      }
    },
    required: ["secret", "amount", "recipientId", "senderCountryCode", "recepientCountryCode"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }

    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    if (body.publicKey) {
      if (keypair.publicKey.toString('hex') != body.publicKey) {
        return cb("Invalid passphrase");
      }
    }
    var conCode = addressHelper.getCountryCodeFromAddress(body.recipientId);
    var address = addressHelper.removeCountryCodeFromAddress(body.recipientId);
    var query = { address: address };

    if(body.recepientCountryCode != conCode) {
      return cb("Recipient country code mismatched!");
    }

    library.balancesSequence.add(function (cb) {
      modules.accounts.getAccount(query, function (err, recipient) {
        if (err) {
          return cb(err.toString());
        }

        if (!recipient) {
          return cb("Recipient not found");
        }

        if(body.recepientCountryCode != recipient.countryCode) {
          return cb("Recipient country code mismatched!");
        }
        
        var recipientId = recipient.address; 

        if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
          modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
            if (err) {
              return cb(err.toString());
            }

            if (!account) {
              return cb("Multisignature account not found");
            }

            if (!account.multisignatures || !account.multisignatures) {
              return cb("Account does not have multisignatures enabled");
            }

            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
              return cb("Account does not belong to multisignature group");
            }

            modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
              if (err) {
                return cb(err.toString());
              }

              if (!requester || !requester.publicKey) {
                return cb("Invalid requester");
              }

              if (requester.secondSignature && !body.secondSecret) {
                return cb("Invalid second passphrase");
              }

              if (requester.publicKey == account.publicKey) {
                return cb("Invalid requester");
              }

              var secondKeypair = null;

              if (requester.secondSignature) {
                var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                secondKeypair = ed.MakeKeypair(secondHash);
              }

              try {
                var transaction = library.base.transaction.create({
                  type: TransactionTypes.DOCUMENT_VERIFICATION_TRS,
                  amount: body.amount,
                  sender: account,
                  recipientId: recipientId,
                  keypair: keypair,
                  requester: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  countryCode: body.senderCountryCode,
                  recepientCountryCode: body.recepientCountryCode
                });
              } catch (e) {
                return cb(e.toString());
              }
              modules.transactions.receiveTransactions([transaction], cb);
            });
          });
        } else {
          modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
            if(account && !account.countryCode) {
              modules.accounts.setAccountAndGet({ publicKey: keypair.publicKey.toString('hex'), countryCode: body.senderCountryCode }, function (err, account) {
                library.logger.debug('=========================== after setAccountAndGet ==========================');
                address = modules.accounts.generateAddressByPublicKey2(keypair.publicKey.toString('hex'))
                if (!account) {
                  return cb("Account not found");
                }
                if(account.countryCode != body.senderCountryCode) {
                  return cb("Account country code mismatched!");
                }
                if(addressHelper.generateAddressWithCountryCode(account.address, account.countryCode) != addressHelper.generateAddressWithCountryCode(address, body.senderCountryCode)) {
                  return cb("Account Address mismatched!");
                }
                if (err) {
                  return cb(err.toString());
                }
    
                if (account.secondSignature && !body.secondSecret) {
                  return cb("Invalid second passphrase");
                }
    
                var secondKeypair = null;
    
                if (account.secondSignature) {
                  var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                  secondKeypair = ed.MakeKeypair(secondHash);
                }
    
                try {
                  var transaction = library.base.transaction.create({
                    type: TransactionTypes.DOCUMENT_VERIFICATION_TRS,
                    amount: body.amount,
                    sender: account,
                    recipientId: recipientId,
                    keypair: keypair,
                    secondKeypair: secondKeypair,
                    message: body.message,
                    countryCode: body.senderCountryCode,
                    recepientCountryCode: body.recepientCountryCode
                  });
                } catch (e) {
                  return cb(e.toString());
                }
                modules.transactions.receiveTransactions([transaction], cb);
              });
            } else {
              library.logger.debug('=========================== after getAccount ==========================');
                address = modules.accounts.generateAddressByPublicKey2(keypair.publicKey.toString('hex'));
                if (err) {
                  return cb(err.toString());
                }
                if (!account) {
                  return cb("Account not found");
                }
                
                if(account.countryCode != body.senderCountryCode) {
                  return cb("Account country code mismatched!");
                }

                if(addressHelper.generateAddressWithCountryCode(account.address, account.countryCode) != addressHelper.generateAddressWithCountryCode(address, body.senderCountryCode)) {
                  return cb("Account Address mismatched!");
                }
                
                if (account.secondSignature && !body.secondSecret) {
                  return cb("Invalid second passphrase");
                }
    
                var secondKeypair = null;
    
                if (account.secondSignature) {
                  var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                  secondKeypair = ed.MakeKeypair(secondHash);
                }
    
                try {
                  var transaction = library.base.transaction.create({
                    type: TransactionTypes.DOCUMENT_VERIFICATION_TRS,
                    amount: body.amount,
                    sender: account,
                    recipientId: recipientId,
                    keypair: keypair,
                    secondKeypair: secondKeypair,
                    message: body.message,
                    countryCode: body.senderCountryCode,
                    recepientCountryCode: body.recepientCountryCode
                  });
                } catch (e) {
                  return cb(e.toString());
                }
                modules.transactions.receiveTransactions([transaction], cb);
            }
          });
        }
      });
    }, function (err, transaction) {
      if (err) {
        return cb(err.toString());
      }

      cb(null, { transactionId: transaction[0].id });
    });
  });
}

shared.getWalletInfo = function (req, cb) {
  var query = req.body;
  if(query.currency.toUpperCase() == 'BEL') {
    query.address = addressHelper.removeCountryCodeFromAddress(query.address);
  }
  library.scheme.validate(query, {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        minLength: 1
      },
      currency: {
        type: "string",
        minimum: 1
      }
    },
    required: ['address', 'currency']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }
    var queryString = "SELECT accountId, secondWalletAddress, currency, status " + 
    "FROM mem_accounts_attach_wallets acw " +
    "WHERE " +
    "secondWalletAddress= '"+query.address+"'" + " AND " +
    "currency='"+query.currency.toUpperCase()+"'";

    var fields = ['baseAddress', 'address', 'currency','status'];
    var params = {};
  
    library.dbLite.query(queryString, params, fields, function(err, row) {
      if(err) {
        return cb('Error occured while getting address info');
      }
      
      if(!row.length) {
        return cb('Invalid address or currency');
      }
      var info = {
        baseAddress: row[0].baseAddress,
        address: row[0].address,
        currency: row[0].currency,
        status: row[0].status
      };
      
      modules.accounts.getAccounts({
        address: {$in: [info.baseAddress, info.address]}
      }, ['address', "countryCode"], function (err, rows) {
        if (err) {
          return cb("Database error");
        }
        rows.forEach(function(row, index1) {
          if(row.address == info.baseAddress) {
            info.baseAddress = info.baseAddress.concat((row.countryCode)? row.countryCode: '');
          }
          if(row.address == info.address) {
            info.address = info.address.concat((row.countryCode)? row.countryCode: '');
          }
        });
        cb(null, { info: info });
      });
    });
  });
}
private.attachWallets = function(body, cb) {
  var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
  var keypair = ed.MakeKeypair(hash);

  if (body.publicKey) {
    if (keypair.publicKey.toString('hex') != body.publicKey) {
      return cb("Invalid passphrase");
    }
  }
  
  library.balancesSequence.add(function (cb) {
    if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
      modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
        if (err) {
          return cb(err.toString());
        }

        if (!account) {
          return cb("Multisignature account not found");
        }

        if (!account.multisignatures || !account.multisignatures) {
          return cb("Account does not have multisignatures enabled");
        }

        if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
          return cb("Account does not belong to multisignature group");
        }

        modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
          if (err) {
            return cb(err.toString());
          }

          if (!requester || !requester.publicKey) {
            return cb("Invalid requester");
          }

          if (requester.secondSignature && !body.secondSecret) {
            return cb("Invalid second passphrase");
          }

          if (requester.publicKey == account.publicKey) {
            return cb("Invalid requester");
          }

          var secondKeypair = null;

          if (requester.secondSignature) {
            var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
            secondKeypair = ed.MakeKeypair(secondHash);
          }

          try {
            var transaction = library.base.transaction.create({
              type: TransactionTypes.WHITELIST_WALLET_TRS,
              sender: account,
              keypair: keypair,
              requester: keypair,
              secondKeypair: secondKeypair,
              message: body.message,
              countryCode: body.countryCode,
              whiteList: body.whiteList,
              currencyType: body.currencyType
            });
          } catch (e) {
            return cb(e.toString());
          }
          modules.transactions.receiveTransactions([transaction], cb);
        });
      });
    } else {
      modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
        library.logger.debug('=========================== after getAccount ==========================');
          if (err) {
            return cb(err.toString());
          }
          if (!account) {
            return cb("Account not found");
          }
          
          if(account.countryCode != body.countryCode) {
            return cb("Account country code mismatched!");
          }
          
          if (account.secondSignature && !body.secondSecret) {
            return cb("Invalid second passphrase");
          }

          var secondKeypair = null;

          if (account.secondSignature) {
            var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
            secondKeypair = ed.MakeKeypair(secondHash);
          }

          try {
            var transaction = library.base.transaction.create({
              type: TransactionTypes.WHITELIST_WALLET_TRS,
              sender: account,
              keypair: keypair,
              secondKeypair: secondKeypair,
              message: body.message,
              countryCode: body.countryCode,
              whiteList: body.whiteList,
              currencyType: body.currencyType
            });
          } catch (e) {
            return cb(e.toString());
          }
          modules.transactions.receiveTransactions([transaction], cb);
      });
    }
  }, function (err, transaction) {
    if (err) {
      return cb(err.toString());
    }

    cb(null, { transactionId: transaction[0].id });
  });
}
shared.attachWalletsOnBehalf = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      multisigAccountPublicKey: {
        type: "string",
        format: "publicKey"
      },
      message: {
        type: "string",
        maxLength: 256
      },
      countryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      attachFrom: {
        type: "string",
        minLength: 1
      },
      attachFromCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      attachTo: {
        type: "array",
        minLength: 1
      },
      currencyType: {
        type: "string",
        minLength: 1
      }
    },
    required: ["secret", "countryCode", "attachFrom", "attachTo", "currencyType", "attachFromCountryCode"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }
    body.currencyType = body.currencyType.toUpperCase();
    
    if(!body.attachTo.length) {
      return cb("WhiteList atleast 1 wallet");
    }
    if(body.attachTo.length > constants.maxWhiteListWallets) {
      return cb("You can whiteList maximum 10 wallets at a time.");
    }
    if(body.currencyType == 'BEL') {
      async.eachSeries(body.attachTo, function (list, cb) {
        if(!addressHelper.isAddress(list.address.slice(0, -2))) {
          return cb("Wrong address found: " + list.address);
        }
        if(body.attachFromCountryCode != addressHelper.getCountryCodeFromAddress(list.address)) {
          return cb("You are trying to attach adddress of diffrent country: " + list.address);
        }
        list.address = addressHelper.removeCountryCodeFromAddress(list.address);
        list.currency = list.currency.toUpperCase();
        if(list.currency != 'BEL') {
          return cb("you can attach only BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        private.attachWalletsByOnBehalf(body, cb);
      });
    } else if(body.currencyType == 'NON-BEL') {
      async.eachSeries(body.attachTo, function (list, cb) {
        list.currency = list.currency.toUpperCase();
        if(list.currency == 'BEL') {
          return cb("you can attach only NON-BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        private.attachWalletsByOnBehalf(body, cb);
      });
    } else {
      return cb("currencyType must be BEL or NON-BEL");
    }
  });
}

private.attachWalletsByOnBehalf = function(body, cb) {
  var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
  var keypair = ed.MakeKeypair(hash);

  if (body.publicKey) {
    if (keypair.publicKey.toString('hex') != body.publicKey) {
      return cb("Invalid passphrase");
    }
  }

  body.attachFrom = addressHelper.removeCountryCodeFromAddress(body.attachFrom);

  library.balancesSequence.add(function (cb) {
    if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
      modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
        if (err) {
          return cb(err.toString());
        }

        if (!account) {
          return cb("Multisignature account not found");
        }

        if (!account.multisignatures || !account.multisignatures) {
          return cb("Account does not have multisignatures enabled");
        }

        if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
          return cb("Account does not belong to multisignature group");
        }

        modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
          if (err) {
            return cb(err.toString());
          }

          if (!requester || !requester.publicKey) {
            return cb("Invalid requester");
          }

          if (requester.secondSignature && !body.secondSecret) {
            return cb("Invalid second passphrase");
          }

          if (requester.publicKey == account.publicKey) {
            return cb("Invalid requester");
          }

          var secondKeypair = null;

          if (requester.secondSignature) {
            var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
            secondKeypair = ed.MakeKeypair(secondHash);
          }

          try {
            var transaction = library.base.transaction.create({
              type: TransactionTypes.ONBEHALF_WHITELIST_WALLETS,
              sender: account,
              keypair: keypair,
              requester: keypair,
              secondKeypair: secondKeypair,
              message: body.message,
              countryCode: body.countryCode,
              attachFrom: body.attachFrom,
              attachTo: body.attachTo,
              currencyType: body.currencyType,
              attachFromCountryCode: body.attachFromCountryCode
            });
          } catch (e) {
            return cb(e.toString());
          }
          modules.transactions.receiveTransactions([transaction], cb);
        });
      });
    } else {
      modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
        library.logger.debug('=========================== after getAccount ==========================');
          if (err) {
            return cb(err.toString());
          }
          if (!account) {
            return cb("Account not found");
          }
          
          if(account.countryCode != body.countryCode) {
            return cb("Account country code mismatched!");
          }
          
          if (account.secondSignature && !body.secondSecret) {
            return cb("Invalid second passphrase");
          }

          var secondKeypair = null;

          if (account.secondSignature) {
            var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
            secondKeypair = ed.MakeKeypair(secondHash);
          }

          try {
            var transaction = library.base.transaction.create({
              type: TransactionTypes.ONBEHALF_WHITELIST_WALLETS,
              sender: account,
              keypair: keypair,
              secondKeypair: secondKeypair,
              message: body.message,
              countryCode: body.countryCode,
              attachFrom: body.attachFrom,
              attachTo: body.attachTo,
              currencyType: body.currencyType,
              attachFromCountryCode: body.attachFromCountryCode
            });
          } catch (e) {
            return cb(e.toString());
          }
          modules.transactions.receiveTransactions([transaction], cb);
      });
    }
  }, function (err, transaction) {
    if (err) {
      return cb(err.toString());
    }

    cb(null, { transactionId: transaction[0].id });
  });
}

// onBehalf DocVerification Payment
shared.onBehalfDocVerificationPayment = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      amount: {
        type: "integer",
        minimum: 1,
        maximum: constants.totalAmount
      },
      recipientId: {
        type: "string",
        minLength: 1
      },
      publicKey: {
        type: "string",
        format: "publicKey"
      },
      secondSecret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      multisigAccountPublicKey: {
        type: "string",
        format: "publicKey"
      },
      message: {
        type: "string",
        maxLength: 256
      },
      senderCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      recepientCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      },
      payFor: {
        type: "string",
        minLength: 1
      },
      payForCountryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      }
    },
    required: ["secret", "amount", "recipientId", "payFor", "senderCountryCode", "recepientCountryCode", "payForCountryCode"]
  }, function (err) {
    if (err) {
      return cb(err[0].message + ': ' + err[0].path);
    }

    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    if (body.publicKey) {
      if (keypair.publicKey.toString('hex') != body.publicKey) {
        return cb("Invalid passphrase");
      }
    }
    var payForConCode = addressHelper.getCountryCodeFromAddress(body.payFor);
    body.payFor = addressHelper.removeCountryCodeFromAddress(body.payFor);

    var recConCode = addressHelper.getCountryCodeFromAddress(body.recipientId);
    var recipientId = addressHelper.removeCountryCodeFromAddress(body.recipientId);

    if(body.recepientCountryCode != recConCode) {
      return cb("recipient country code mismatched!");
    }
    if(body.payForCountryCode != payForConCode) {
      return cb("payFor country code mismatched!");
    }
    var query = { address: recipientId };

    library.balancesSequence.add(function (cb) {
      modules.accounts.getAccount(query, function (err, recipient) {
        if (err) {
          return cb(err.toString());
        }
      
        if(!recipient) {
          return cb("Recipient not found!");
        }
        
        if(recipient.countryCode != body.recepientCountryCode) {
          return cb("Recipient country code mismatched!");
        }

        if (!recipientId) {
          return cb("Recipient not found!");
        }

        if (body.multisigAccountPublicKey && body.multisigAccountPublicKey != keypair.publicKey.toString('hex')) {
          modules.accounts.getAccount({ publicKey: body.multisigAccountPublicKey }, function (err, account) {
            if (err) {
              return cb(err.toString());
            }

            if (!account) {
              return cb("Multisignature account not found");
            }

            if (!account.multisignatures || !account.multisignatures) {
              return cb("Account does not have multisignatures enabled");
            }

            if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
              return cb("Account does not belong to multisignature group");
            }

            modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
              if (err) {
                return cb(err.toString());
              }

              if (!requester || !requester.publicKey) {
                return cb("Invalid requester");
              }

              if (requester.secondSignature && !body.secondSecret) {
                return cb("Invalid second passphrase");
              }

              if (requester.publicKey == account.publicKey) {
                return cb("Invalid requester");
              }

              var secondKeypair = null;

              if (requester.secondSignature) {
                var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
                secondKeypair = ed.MakeKeypair(secondHash);
              }

              try {
                var transaction = library.base.transaction.create({
                  type: TransactionTypes.ONBEHALF_PAYMENT_FOR_DOC_VERIFICATION,
                  amount: body.amount,
                  sender: account,
                  payFor: body.payFor,
                  recipientId: recipientId,
                  keypair: keypair,
                  requester: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  countryCode: body.senderCountryCode,
                  recepientCountryCode: body.recepientCountryCode,
                  payForCountryCode: body.payForCountryCode
                });
              } catch (e) {
                return cb(e.toString());
              }
              modules.transactions.receiveTransactions([transaction], cb);
            });
          });
        } else {
          modules.accounts.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
            library.logger.debug('=========================== after getAccount ==========================');
            address = modules.accounts.generateAddressByPublicKey2(keypair.publicKey.toString('hex'));
            if (err) {
              return cb(err.toString());
            }
            if (!account) {
              return cb("Account not found");
            }
            
            if(account.countryCode != body.senderCountryCode) {
              return cb("Account country code mismatched!");
            }

            if(addressHelper.generateAddressWithCountryCode(account.address, account.countryCode) != addressHelper.generateAddressWithCountryCode(address, body.senderCountryCode)) {
              return cb("Account Address mismatched!");
            }
            
            if (account.secondSignature && !body.secondSecret) {
              return cb("Invalid second passphrase");
            }

            var secondKeypair = null;

            if (account.secondSignature) {
              var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
              secondKeypair = ed.MakeKeypair(secondHash);
            }

            try {
              var transaction = library.base.transaction.create({
                type: TransactionTypes.ONBEHALF_PAYMENT_FOR_DOC_VERIFICATION,
                amount: body.amount,
                sender: account,
                payFor: body.payFor,
                recipientId: recipientId,
                keypair: keypair,
                secondKeypair: secondKeypair,
                message: body.message,
                countryCode: body.senderCountryCode,
                recepientCountryCode: body.recepientCountryCode,
                payForCountryCode: body.payForCountryCode
              });
            } catch (e) {
              return cb(e.toString());
            }
            modules.transactions.receiveTransactions([transaction], cb);
          });
        }
      });
    }, function (err, transaction) {
      if (err) {
        return cb(err.toString());
      }

      cb(null, { transactionId: transaction[0].id });
    });
  });
}

// get all attached wallets
shared.getAttachedWallets = function (req, cb) {
  var query = req.body;

  library.scheme.validate(query, {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        minLength: 1
      }
    },
    required: ['address']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    var conCode = addressHelper.getCountryCodeFromAddress(query.address);
    query.address = addressHelper.removeCountryCodeFromAddress(query.address);
    modules.accounts.getAccount({address: query.address}, function(err, account) {

      if(!account) {
        return cb('account not fouund!');
      }
      if(account.countryCode != conCode) {
        return cb('Address countryCode missmatched!');
      }
      var queryString = "SELECT secondWalletAddress, currency, status " + 
      "FROM mem_accounts_attach_wallets " +
      "WHERE " +
      "accountId= '"+query.address+"'";

      var fields = ['address', 'currency','status'];
      var params = {};
    
      library.dbLite.query(queryString, params, fields, function(err, rows) {
        if(err) {
          return cb('Error occured while getting address info');
        }
        
        if(!rows.length) {
          return cb('Invalid address or currency');
        }
        var info = [];

        async.eachSeries(rows, function (row, cb) {
          if(row.currency == 'BEL') {
            modules.accounts.getAccount({ 
              address: row.address 
            }, function (err, res) {
              info.push({address: row.address.concat(res.countryCode), currency: row.currency, status: row.status});
              cb();
            });
          } else {
            info.push({address: row.address, currency: row.currency, status: row.status});
            cb();
          }  
        }, function(err) {
          cb(null, { info: info });
        });
      });
    });
  });
}

// get all attached wallets
shared.getAttachedWalletsOnBehalf = function (req, cb) {
  var query = req.body;

  library.scheme.validate(query, {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        minLength: 1
      },
      offset: {
        type: "integer",
        minimum: 0
      },
      limit: {
        type: "integer",
        minimum: 1
      }
    },
    required: ['address']
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    var conCode = addressHelper.getCountryCodeFromAddress(query.address);
    query.address = addressHelper.removeCountryCodeFromAddress(query.address);
    modules.accounts.getAccount({address: query.address}, function(err, account) {

      if(!account) {
        return cb('account not fouund!');
      }
      if(account.countryCode != conCode) {
        return cb('Address countryCode missmatched!');
      }
      
      query.offset = (query.offset)? query.offset:0;
      query.limit = (query.limit)? query.limit: 20;

      var queryString = "SELECT secondWalletAddress, currency, status, accountId, onBehalfUserWalletAddress " + 
      "FROM mem_accounts_attach_wallets " +
      "WHERE " +
      "onBehalfUserWalletAddress= '"+query.address+"'" + 
      " limit " +query.limit + " offset " + query.offset;

      var fields = ['attachedAddress', 'currency','status', 'senderId', 'attachFrom'];
      var params = {};
    
      library.dbLite.query(queryString, params, fields, function(err, rows) {
        if(err) {
          return cb('Error occured while getting address info');
        }
        
        if(!rows.length) {
          return cb('Invalid address');
        }
        var info = [];
        var countryCode;
        async.eachSeries(rows, function (row, cb) {
            modules.accounts.getAccount({ 
              address: row.attachFrom 
            }, function (err, res) {
              if(row.currency == 'BEL') {
                info.push({attachFrom: row.attachFrom.concat(res.countryCode), attachedAddress: row.attachedAddress.concat(res.countryCode), currency: row.currency, status: row.status});
                cb();
              } else {
                info.push({attachFrom: row.attachFrom.concat(res.countryCode), attachedAddress: row.attachedAddress, currency: row.currency, status: row.status});
                cb();
              }
            });
        }, function(err) {
          cb(null, { info: info });
        });
      });
    });
  });
}
// Export
module.exports = Transactions;
