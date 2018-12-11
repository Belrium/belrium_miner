var crypto = require('crypto');
var util = require('util');
var extend = require('extend');
var async = require('async');
var ed = require('../utils/ed.js');
var bignum = require('bignumber');
var Mnemonic = require('bitcore-mnemonic');
var slots = require('../utils/slots.js');
var Router = require('../utils/router.js');
var BlockStatus = require("../utils/block-status.js");
var constants = require('../utils/constants.js');
var TransactionTypes = require('../utils/transaction-types.js');
var Diff = require('../utils/diff.js');
var sandboxHelper = require('../utils/sandbox.js');
var addressHelper = require('../utils/address.js');

// Private fields
var modules, library, self, private = {}, shared = {};

private.blockStatus = new BlockStatus();

function Vote() {
  this.create = function (data, trs) {
    trs.recipientId = null;
    trs.countryCode = data.countryCode;
    trs.asset.vote = {
      votes: data.votes
    };

    return trs;
  }

  this.calculateFee = function (trs, sender) {
    return constants.fees.vote * constants.fixedPoint;
  }

  this.verify = function (trs, sender, cb) {
    if (!trs.asset.vote || !trs.asset.vote.votes || !trs.asset.vote.votes.length) {
      return setImmediate(cb, "No votes sent");
    }

    if (trs.asset.vote.votes && trs.asset.vote.votes.length > 33) {
      return setImmediate(cb, "Voting limit exceeded. Maximum is 33 votes per transaction");
    }

    modules.delegates.checkDelegates(trs.senderPublicKey, trs.asset.vote.votes, function (err) {
      setImmediate(cb, err, trs);
    });
  }

  this.process = function (trs, sender, cb) {
    setImmediate(cb, null, trs);
  }

  this.getBytes = function (trs) {
    try {
      var buf = trs.asset.vote.votes ? new Buffer(trs.asset.vote.votes.join(''), 'utf8') : null;
    } catch (e) {
      throw Error(e.toString());
    }

    return buf;
  }

  this.apply = function (trs, block, sender, cb) {
    library.base.account.merge(sender.address, {
      delegates: trs.asset.vote.votes,
      blockId: block.id,
      round: modules.round.calc(block.height)
    }, cb);
  }

  this.undo = function (trs, block, sender, cb) {
    if (trs.asset.vote.votes === null) return cb();

    var votesInvert = Diff.reverse(trs.asset.vote.votes);

    library.base.account.merge(sender.address, {
      delegates: votesInvert,
      blockId: block.id,
      round: modules.round.calc(block.height)
    }, cb);
  }

  this.applyUnconfirmed = function (trs, sender, cb) {
    if (modules.blocks.getLastBlock() &&
      modules.blocks.getLastBlock().height < 1294343 &&
      global.Config.netVersion === 'mainnet') {
      return setImmediate(cb)
    }
    var key = sender.address + ':' + trs.type;
    if (library.oneoff.has(key)) {
      return setImmediate(cb, 'Double submit');
    }
    library.oneoff.set(key, true);
    setImmediate(cb)
  }

  this.undoUnconfirmed = function (trs, sender, cb) {
    var key = sender.address + ':' + trs.type;
    library.oneoff.delete(key);
    setImmediate(cb)
  }

  this.objectNormalize = function (trs) {
    var report = library.scheme.validate(trs.asset.vote, {
      type: "object",
      properties: {
        votes: {
          type: "array",
          minLength: 1,
          maxLength: 101,
          uniqueItems: true
        }
      },
      required: ['votes']
    });

    if (!report) {
      throw new Error("Incorrect votes in transactions: " + library.scheme.getLastError());
    }

    return trs;
  }

  this.dbRead = function (raw) {

    if (!raw.v_votes) {
      return null
    } else {
      var votes = raw.v_votes.split(',');
      var vote = {
        votes: votes
      };
      return { vote: vote };
    }
  }

  this.dbSave = function (trs, cb) {
    library.dbLite.query("INSERT INTO votes(votes, transactionId) VALUES($votes, $transactionId)", {
      votes: util.isArray(trs.asset.vote.votes) ? trs.asset.vote.votes.join(',') : null,
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


function Acstatus () {
	this.create = function (data, trs) {
		trs.recipientId = null;
    trs.amount = 0;
    trs.countryCode = data.countryCode;
		trs.asset.ac_status = {
      countryCode: data.countryCode,
      status: data.status,
      expDate: data.expDate,
			publicKey: data.sender.publicKey
		};
		return trs;
	};

	this.calculateFee = function (trs, sender) {
		return constants.fees.account * constants.fixedPoint;
	};

	this.verify = function (trs, sender, cb) {
		if (trs.recipientId) {
			return setImmediate(cb, 'Invalid recipient');
		}
	
		/*if (trs.amount !== 0) {
			return setImmediate(cb, 'Invalid transaction amount');
    }*/
	
		if (!trs.asset || !trs.asset.ac_status) {
			return setImmediate(cb, 'Invalid transaction asset');
		}
	
		//var isAddress = /^[0-9]{1,21}[BL|bl]$/g;
		var allowSymbols = /^[a-z0-9!@$&_.]+$/g;
	
		var status = trs.asset.ac_status.status;
		/*if (status != 0 || status != 1) {
			return setImmediate(cb, 'Invalid status');
		}*/
		cb(null, trs);
	};

	this.process = function (trs, sender, cb) {
    var key = sender.address + ':' + trs.type;
    if (library.oneoff.has(key)) {
      return setImmediate(cb, 'Double submit');
    }
    library.oneoff.set(key, true);

		return setImmediate(cb, null, trs);
	};

	this.getBytes = function (trs) {
		if (!trs.asset.ac_status.status) {
			return null;
		}
	
		try {
      var buf = new Buffer(trs.asset.ac_status.status);
      buf.writeUInt8(0x3, 0);
		} catch (e) {
			throw e;
		}
		return buf;
	};

	this.apply = function (trs, block, sender, cb) {
		var data = {
      address: sender.address,
      countryCode: trs.asset.ac_status.countryCode ? trs.asset.ac_status.countryCode: '',
			u_status: trs.asset.ac_status.status,
      status: trs.asset.ac_status.status,
      expDate: trs.asset.ac_status.expDate
		};
  
    var key = sender.address + ':' + trs.type;
    library.oneoff.delete(key);
    
		modules.accounts.setAccountAndGet(data, cb);
	};

	this.undo = function (trs, block, sender, cb) {
		var data = {
      address: sender.address,
      countryCode: trs.asset.ac_status.countryCode ? trs.asset.ac_status.countryCode: '',
			u_status: trs.asset.ac_status.status == 0?1:0,
      status: !trs.asset.ac_status.status == 0?1:0,
      expDate: trs.asset.ac_status.expDate
		};
	
		modules.accounts.setAccountAndGet(data, cb);
	};

	this.applyUnconfirmed = function (trs, sender, cb) {
		var data = {
      address: sender.address,
      countryCode: trs.asset.ac_status.countryCode ? trs.asset.ac_status.countryCode: '',
			u_status: trs.asset.ac_status.status,
      status: trs.asset.ac_status.status,
      expDate: trs.asset.ac_status.expDate
		};
  
    //modules.accounts.setAccountAndGet(data, cb);
    setImmediate(cb);
	};

	this.undoUnconfirmed = function (trs, sender, cb) {
		var data = {
      address: sender.address,
      countryCode: trs.asset.ac_status.countryCode ? trs.asset.ac_status.countryCode: '',
			u_status: trs.asset.ac_status.status == 0 ? 1:0,
      status: trs.asset.ac_status.status == 0 ? 1:0,
      expDate: trs.asset.ac_status.expDate
		};
    
    //modules.accounts.setAccountAndGet(data, cb);
    setImmediate(cb);
	};

	this.objectNormalize = function (trs) {
    var schema = {
      id: 'AcStatus',
      type: 'object',
      properties: {
        publicKey: {
          type: 'string',
          format: 'publicKey'
        }
      },
      required: ['publicKey']
    };
		var report = library.scheme.validate(trs.asset.ac_status, schema);
		if (!report) {
      throw new Error("Failed to validate AcStatus schema: " + library.scheme.getLastError());
    }
		return trs;
	};

	this.dbRead = function (raw) {
		if (!raw.acs_status) {
			return null;
		} else {
			var ac_status = {
				status: raw.acs_status,
				publicKey: raw.t_senderPublicKey,
        address: raw.t_senderId,
        countryCode: raw.cc_countryCode,
        expDate: raw.acs_expDate
			};
	
			return {ac_status: ac_status};
		}
	};

	this.dbSave = function (trs, cb) {
    library.dbLite.query("INSERT INTO ac_status(status, expDate, transactionId) VALUES($status, $expDate, $transactionId)", {
      status: trs.asset.ac_status.status,
      expDate: trs.asset.ac_status.expDate,
      transactionId: trs.id
    }, function(err) {
      library.dbLite.query("INSERT INTO ac_countrycode(countryCode, transactionId) VALUES($countryCode, $transactionId)", {
        countryCode: trs.asset.ac_status.countryCode,
        transactionId: trs.id
      }, function(err) {
        library.dbLite.query("UPDATE mem_accounts_attach_wallets SET status=$status WHERE accountId=$accountId", {
          status: trs.asset.ac_status.status,
          accountId: trs.senderId
        }, function(err) {
          var queryString = "SELECT secondWalletAddress, status, currency " + 
          "FROM mem_accounts_attach_wallets " +
          "WHERE " +
          "accountId= '"+trs.senderId+"'";

          var fields = ['address','status', 'currency'];
          var params = {};

          library.dbLite.query(queryString, params, fields, function(err, rows) {
            async.eachSeries(rows, function (row, cb) {
              if(row.currency == 'BEL') {
                modules.accounts.setAccountAndGet({ 
                  address: row.address,
                  countryCode: trs.countryCode,
                  status: row.status,
                  u_status: row.status,
                  expDate: trs.asset.ac_status.expDate 
                }, function (err, res) {
                  cb();
                });
              } else {
                cb();
              }  
            }, cb);
          });
        });
      });
    });
	};

	this.ready = function (trs, sender) {
    if (util.isArray(sender.multisignatures) && sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }
      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

//Disable Account Status
function DisableAcstatus () {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
    trs.amount = 0;
    trs.countryCode = data.countryCode;
		trs.asset.ac_status = {
			status: data.status,
			address: data.recipientId
		};
		return trs;
	};

	this.calculateFee = function (trs, sender) {
		return constants.fees.disableAccount * constants.fixedPoint;
	};

	this.verify = function (trs, sender, cb) {
		if (!trs.recipientId) {
			return setImmediate(cb, 'Invalid recipient');
		}
	
		/*if (trs.amount !== 0) {
			return setImmediate(cb, 'Invalid transaction amount');
    }*/
	
		if (!trs.asset || !trs.asset.ac_status) {
			return setImmediate(cb, 'Invalid transaction asset');
		}
	
		//var isAddress = /^[0-9]{1,21}[BL|bl]$/g;
		var allowSymbols = /^[a-z0-9!@$&_.]+$/g;
	
		var status = trs.asset.ac_status.status;
		/*if (status != 0 || status != 1) {
			return setImmediate(cb, 'Invalid status');
		}*/
		cb(null, trs);
	};

	this.process = function (trs, sender, cb) {
    /*var key = sender.address + ':' + trs.type;
    if (library.oneoff.has(key)) {
      return setImmediate(cb, 'Double submit');
    }
    library.oneoff.set(key, true);*/
    
		return setImmediate(cb, null, trs);
	};

	this.getBytes = function (trs) {
		if (!trs.asset.ac_status.status) {
			return null;
		}
	
		try {
      var buf = new Buffer(trs.asset.ac_status.status);
      buf.writeUInt8(0x3, 0);
		} catch (e) {
			throw e;
		}
		return buf;
	};

	this.apply = function (trs, block, sender, cb) {
		var data = {
			address: trs.recipientId,
			u_status: trs.asset.ac_status.status,
			status: trs.asset.ac_status.status
		};

    /*var key = sender.address + ':' + trs.type;
    library.oneoff.delete(key);*/

		modules.accounts.setAccountAndGet(data, cb);
	};

	this.undo = function (trs, block, sender, cb) {
		var data = {
			address: trs.recipientId,
			u_status: trs.asset.ac_status.status == 0?1:0,
			status: !trs.asset.ac_status.status == 0?1:0
		};
    
		modules.accounts.setAccountAndGet(data, cb);
	};

	this.applyUnconfirmed = function (trs, sender, cb) {
		var data = {
			address: trs.recipientId,
			u_status: trs.asset.ac_status.status,
			status: trs.asset.ac_status.status
		};
    
    setImmediate(cb);
	};

	this.undoUnconfirmed = function (trs, sender, cb) {
		var data = {
			address: trs.recipientId,
			u_status: trs.asset.ac_status.status == 0 ? 1:0,
			status: trs.asset.ac_status.status == 0 ? 1:0
		};
    
    setImmediate(cb);
	};

	this.objectNormalize = function (trs) {
    var schema = {
      id: 'AcStatus',
      type: 'object',
      properties: {
        address: {
          type: 'string'
        }
      },
      required: ['address']
    };
		var report = library.scheme.validate(trs.asset.ac_status, schema);
		if (!report) {
      throw new Error("Failed to validate DisableAcStatus schema: " + library.scheme.getLastError());
    }
		return trs;
	};

	this.dbRead = function (raw) {

		if (!raw.acs_status) {
			return null;
		} else {
			var ac_status = {
				status: raw.acs_status,
				address: raw.t_recipientId
			};

			return {ac_status: ac_status};
		}
	};

	this.dbSave = function (trs, cb) {
    
    library.dbLite.query("INSERT INTO ac_status(status, transactionId) VALUES($status, $transactionId)", {
      status: trs.asset.ac_status.status,
			transactionId: trs.id
    }, function(err) {
      library.dbLite.query("UPDATE mem_accounts_attach_wallets SET status=$status WHERE accountId=$accountId OR secondWalletAddress=$secondWalletAddress", {
        status: trs.asset.ac_status.status,
        accountId: trs.recipientId,
        secondWalletAddress: trs.recipientId
      }, function(err) {
        var queryString = "SELECT secondWalletAddress, status, currency " + 
        "FROM mem_accounts_attach_wallets " +
        "WHERE " +
        "accountId= '"+trs.recipientId+"'";

        var fields = ['address','status', 'currency'];
        var params = {};

        library.dbLite.query(queryString, params, fields, function(err, rows) {
          async.eachSeries(rows, function (row, cb) {
            if(row.currency == 'BEL') {
              modules.accounts.setAccountAndGet({ 
                address: row.address,
                countryCode: trs.countryCode,
                status: row.status,
                u_status: row.status 
              }, function (err, res) {
                cb();
              });
            } else {
              cb();
            }  
          }, cb);
        });
      });
    });
	};

	this.ready = function (trs, sender) {
    
    if (util.isArray(sender.multisignatures) && sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }
      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

function AttachWallets () {
	this.create = function (data, trs) {
		trs.recipientId = null;
    trs.amount = 0;
    trs.countryCode = data.countryCode;
		trs.asset.ac_wallets = {
      publicKey: data.sender.publicKey,
      status: data.sender.status,
      whiteList: data.whiteList,
      currencyType: data.currencyType
    };
		return trs;
	};

	this.calculateFee = function (trs, sender) {
    if(trs.asset.ac_wallets.currencyType == 'BEL') {
      return constants.fees.attachWallets.BEL * constants.fixedPoint;
    } else {
      return constants.fees.attachWallets.NON_BEL * constants.fixedPoint;
    }
	};

	this.verify = function (trs, sender, cb) {

		if (trs.recipientId) {
			return setImmediate(cb, 'Invalid recipient');
		}
	
		if (!trs.asset || !trs.asset.ac_wallets) {
			return setImmediate(cb, 'Invalid transaction asset');
    }

    if(trs.asset.ac_wallets.currencyType == 'BEL') {
      async.eachSeries(trs.asset.ac_wallets.whiteList, function (list, cb) {
        if(!addressHelper.isAddress(list.address)) {
          return cb("Wrong address found: " + list.address);
        }
        list.currency = list.currency.toUpperCase();
        if(list.currency != 'BEL') {
          return cb("you can attach only BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        cb();
      });
    } else if(trs.asset.ac_wallets.currencyType == 'NON-BEL') {
      async.eachSeries(trs.asset.ac_wallets.whiteList, function (list, cb) {
        list.currency = list.currency.toUpperCase();
        if(list.currency == 'BEL') {
          return cb("you can attach only NON-BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        cb();
      });
    } else {
      return cb("currencyType must be BEL or NON-BEL");
    }
	};

	this.process = function (trs, sender, cb) {
    async.eachSeries(trs.asset.ac_wallets.whiteList, function (list, cb) {
      list.currency = list.currency.toUpperCase();
        var queryString = "SELECT secondWalletAddress, status, currency " + 
        "FROM mem_accounts_attach_wallets acw " +
        "WHERE " +
        "secondWalletAddress= '"+list.address+"'";

        var fields = ['address','status', 'currency'];
        var params = {};

        library.dbLite.query(queryString, params, fields, function(err, row) {
          if(row && row[0] && row[0].status == 1) {
            if(row[0].currency == 'BEL' && row[0].currency == list.currency) {
              return setImmediate(cb, list.address + trs.countryCode + ' wallet already attached');
            } else {
              return setImmediate(cb, list.address + ' wallet already attached');
            }
          } else {
            cb(null, trs);
          }
        });
    }, function (err) {
      if(err) {
        return cb(err);
      }
      cb(null, trs);
    });
	};

	this.getBytes = function (trs) {
		if (!trs.asset.ac_wallets.status) {
			return null;
		}
	
		try {
      var buf = new Buffer(trs.asset.ac_wallets.status);
      buf.writeUInt8(0x3, 0);
		} catch (e) {
			throw e;
		}
		return buf;
	};

	this.apply = function (trs, block, sender, cb) {
    setImmediate(cb);
	};

	this.undo = function (trs, block, sender, cb) {
    setImmediate(cb);
	};

	this.applyUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
	};

	this.undoUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
	};

	this.objectNormalize = function (trs) {
    var schema = {
      id: 'AttachWallets',
      type: 'object',
      properties: {
        publicKey: {
          type: 'string',
          format: 'publicKey'
        }
      },
      required: ['publicKey']
    };
		var report = library.scheme.validate(trs.asset.ac_wallets, schema);
		if (!report) {
      throw new Error("Failed to validate AttachWallets schema: " + library.scheme.getLastError());
    }
		return trs;
	};

	this.dbRead = function (raw) {
		if (!raw.acw_status) {
			return null;
		} else {
			var ac_wallets = {
        publicKey: raw.t_senderPublicKey,
				status: raw.acw_status,
        whiteList: JSON.parse(raw.acw_secondWalletAddress),
        currencyType: raw.acw_currencyType
			};
			return {ac_wallets: ac_wallets};
		}
	};

	this.dbSave = function (trs, cb) {
    modules.accounts.getAccount({address: trs.senderId}, function(err, sender) {
      library.dbLite.query("INSERT INTO white_label_wallets(senderId, secondWalletAddress, currencyType, status, transactionId) VALUES($senderId, $secondWalletAddress, $currencyType, $status, $transactionId)", {
        senderId: trs.senderId,
        secondWalletAddress: JSON.stringify(trs.asset.ac_wallets.whiteList),
        currencyType: trs.asset.ac_wallets.currencyType,
        status: trs.asset.ac_wallets.status,
        transactionId: trs.id
      }, function(err) {
        if(err) {
          return setImmediate(cb, 'Database error');
        }
        async.eachSeries(trs.asset.ac_wallets.whiteList, function (list, cb) {
          library.dbLite.query("INSERT OR IGNORE INTO mem_accounts_attach_wallets(accountId, secondWalletAddress, currency, status) VALUES($accountId, $secondWalletAddress, $currency, $status)", {
            accountId: trs.senderId,
            secondWalletAddress: list.address,
            currency: list.currency,
            status: trs.asset.ac_wallets.status
          }, function(err, rows) {
            if(err) {
              return setImmediate(cb, 'Database error');
            }
            library.dbLite.query("UPDATE mem_accounts_attach_wallets SET status=$status WHERE secondWalletAddress=$secondWalletAddress", {
              status: trs.asset.ac_wallets.status,
              secondWalletAddress: list.address
            }, function(err) {
              if(trs.asset.ac_wallets.currencyType == 'BEL') {
                modules.accounts.setAccountAndGet({ 
                  address: list.address, 
                  countryCode: sender.countryCode,
                  status: trs.asset.ac_wallets.status,
                  u_status: trs.asset.ac_wallets.status,
                  expDate: sender.expDate 
                }, function (err, res) {
                  if(err) {
                    return setImmediate(cb, 'Database error');
                  }
                  cb();
                });
              } else {
                cb();
              } 
            });
          });
        }, function (err) {
          if(err) {
            return cb(err);
          }
          cb();
        });
      });
    });
	};

	this.ready = function (trs, sender) {
    if (util.isArray(sender.multisignatures) && sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }
      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

//Attach wallet on the behalf of user
function attachWalletsOnBehalf () {
	this.create = function (data, trs) {
		trs.recipientId = null;
    trs.amount = 0;
    trs.countryCode = data.countryCode;
		trs.asset.ac_wallets = {
      publicKey: data.sender.publicKey,
      status: data.sender.status,
      attachFrom: data.attachFrom,
      attachFromCountryCode: data.attachFromCountryCode,
      attachTo: data.attachTo,
      currencyType: data.currencyType
		};
		return trs;
	};

	this.calculateFee = function (trs, sender) {
    if(trs.asset.ac_wallets.currencyType == 'BEL') {
      return constants.fees.attachWalletsOnBehalf.BEL * constants.fixedPoint;
    } else {
      return constants.fees.attachWalletsOnBehalf.NON_BEL * constants.fixedPoint;
    }
	};

	this.verify = function (trs, sender, cb) {
		if (trs.recipientId) {
			return setImmediate(cb, 'Invalid recipient');
		}
	
		if (!trs.asset || !trs.asset.ac_wallets) {
			return setImmediate(cb, 'Invalid transaction asset');
    }
    if(trs.asset.ac_wallets.currencyType === 'BEL') {
    
      async.eachSeries(trs.asset.ac_wallets.attachTo, function (list, cb) {
        if(!addressHelper.isAddress(list.address)) {
          return cb("Wrong address found: " + list.address);
        }
        list.currency = list.currency.toUpperCase();
        if(list.currency != 'BEL') {
          return cb("you can attach only BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        cb();
      });
    } else if(trs.asset.ac_wallets.currencyType == 'NON-BEL') {
      async.eachSeries(trs.asset.ac_wallets.attachTo, function (list, cb) {
        list.currency = list.currency.toUpperCase();
        if(list.currency == 'BEL') {
          return cb("you can attach only NON-BEL wallet");
        }
        cb();
      }, function (err) {
        if(err) {
          return cb(err);
        }
        cb();
      });
    } else {
      return cb("currencyType must be BEL or NON-BEL");
    }
	};

	this.process = function (trs, sender, cb) {
    var address = trs.asset.ac_wallets.attachFrom;
    modules.accounts.getAccount({address: address}, function(err, account) {
      if(!account) {
        return cb(address.concat(trs.countryCode) + ' wallet not exists');
      }
      if(account.countryCode != trs.asset.ac_wallets.attachFromCountryCode) {
        return cb("attachFromCountryCode mismatched!");
      }
      if(account.status != 1) {
        return cb(address.concat((account.countryCode)? account.countryCode: trs.attachFromCountryCode) + ' wallet not verified');
      }
      
      async.eachSeries(trs.asset.ac_wallets.attachTo, function (list, cb) {
        var queryString = "SELECT secondWalletAddress, status, currency " + 
        "FROM mem_accounts_attach_wallets acw " +
        "WHERE " +
        "secondWalletAddress= '"+list.address+"'";
    
        var fields = ['address','status', 'currency'];
        var params = {};
    
        library.dbLite.query(queryString, params, fields, function(err, row) {
          if(row && row[0] && row[0].status == 1) {
            if(row[0].currency == 'BEL' && row[0].currency == list.currency) {
              return setImmediate(cb, list.address + trs.asset.ac_wallets.attachFromCountryCode + ' wallet already attached');
            } else {
              return setImmediate(cb, list.address + ' wallet already attached');
            }
          } else {
            cb(null, trs);
          }
        });
      }, function (err) {
        if(err) {
          return cb(err);
        }
        cb(null, trs);
      });
    });
	};

	this.getBytes = function (trs) {
		if (!trs.asset.ac_wallets.status) {
			return null;
		}
	
		try {
      var buf = new Buffer(trs.asset.ac_wallets.status);
      buf.writeUInt8(0x3, 0);
		} catch (e) {
			throw e;
		}
		return buf;
	};

	this.apply = function (trs, block, sender, cb) {
    setImmediate(cb);
	};

	this.undo = function (trs, block, sender, cb) {
    setImmediate(cb);
	};

	this.applyUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
	};

	this.undoUnconfirmed = function (trs, sender, cb) {
    setImmediate(cb);
	};

	this.objectNormalize = function (trs) {
    var schema = {
      id: 'attachWalletsOnBehalf',
      type: 'object',
      properties: {
        publicKey: {
          type: 'string',
          format: 'publicKey'
        }
      },
      required: ['publicKey']
    };
		var report = library.scheme.validate(trs.asset.ac_wallets, schema);
		if (!report) {
      throw new Error("Failed to validate attachWalletsOnBehalf schema: " + library.scheme.getLastError());
    }
		return trs;
	};

	this.dbRead = function (raw) {
		if (!raw.mw_status) {
			return null;
		} else {
			var ac_wallets = {
        publicKey: raw.t_senderPublicKey,
				status: raw.mw_status,
        attachFrom: raw.mw_attachFrom,
        attachTo: JSON.parse(raw.mw_attachTo),
        currencyType: raw.mw_currencyType,
        attachFromCountryCode: raw.mw_attachFromCountryCode
			};
			return {ac_wallets: ac_wallets};
		}
	};

	this.dbSave = function (trs, cb) {
    modules.accounts.getAccount({address: trs.senderId}, function(err, sender) {
      library.dbLite.query("INSERT INTO white_label_wallets_onBehalf(senderId, attachFrom, attachTo, currencyType, status, attachFromCountryCode, transactionId) VALUES($senderId, $attachFrom, $attachTo, $currencyType, $status, $attachFromCountryCode, $transactionId)", {
        senderId: trs.senderId,
        attachFrom: trs.asset.ac_wallets.attachFrom,
        attachTo: JSON.stringify(trs.asset.ac_wallets.attachTo),
        currencyType: trs.asset.ac_wallets.currencyType,
        status: trs.asset.ac_wallets.status,
        attachFromCountryCode: trs.asset.ac_wallets.attachFromCountryCode,
        transactionId: trs.id
      }, function(err) {
        if(err) {
          return setImmediate(cb, 'Database error');
        }
        async.eachSeries(trs.asset.ac_wallets.attachTo, function (list, cb) {
          library.dbLite.query("INSERT OR IGNORE INTO mem_accounts_attach_wallets(accountId, secondWalletAddress, currency, status, onBehalfUserWalletAddress) VALUES($accountId, $secondWalletAddress, $currency, $status, $onBehalfUserWalletAddress)", {
            accountId: trs.asset.ac_wallets.attachFrom,
            secondWalletAddress: list.address,
            currency: list.currency,
            status: trs.asset.ac_wallets.status,
            onBehalfUserWalletAddress: trs.senderId
          }, function(err, rows) {
            if(err) {
              return setImmediate(cb, 'Database error');
            }
            library.dbLite.query("UPDATE mem_accounts_attach_wallets SET status=$status WHERE secondWalletAddress=$secondWalletAddress", {
              status: trs.asset.ac_wallets.status,
              secondWalletAddress: list.address
            }, function(err) {
              if(trs.asset.ac_wallets.currencyType == 'BEL') {
                modules.accounts.setAccountAndGet({ 
                  address: list.address, 
                  countryCode: trs.asset.ac_wallets.attachFromCountryCode,
                  status: trs.asset.ac_wallets.status,
                  u_status: trs.asset.ac_wallets.status,
                  expDate: sender.expDate 
                }, function (err, res) {
                  if(err) {
                    return setImmediate(cb, 'Database error');
                  }
                  cb();
                });
              } else {
                cb();
              } 
            });
          });
        }, function (err) {
          if(err) {
            return cb(err);
          }
          cb();
        });
        /*
        */
      });
    });
	};

	this.ready = function (trs, sender) {
    if (util.isArray(sender.multisignatures) && sender.multisignatures.length) {
      if (!trs.signatures) {
        return false;
      }
      return trs.signatures.length >= sender.multimin - 1;
    } else {
      return true;
    }
  }
}

// Enable wallet KYC on the behalf of user
function EnableKYCByOnBehalfOfUser () {
	this.create = function (data, trs) {
    trs.recipientId = data.recipientId;
    trs.countryCode = data.countryCode;
		trs.asset.ac_status = {
      countryCode: data.recepientCountryCode,
      status: 1,
      expDate: data.expDate,
			publicKey: data.sender.publicKey
		};
		return trs;
	};

	this.calculateFee = function (trs, sender) {
    return constants.fees.enableKYCOnBehalfOfUser * constants.fixedPoint;
	};

	this.verify = function (trs, sender, cb) {

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
      if(recipient && recipient.status) {
        return cb("User KYC is already enabled on blockchain!");
      }
      cb(null, trs);
    });
	};

	this.process = function (trs, sender, cb) {
    /*var key = sender.address + ':' + trs.type;
    if (library.oneoff.has(key)) {
      return setImmediate(cb, 'Double submit');
    }
    library.oneoff.set(key, true);*/
    
    if(!sender.status) {
      return cb(sender.address.concat(sender.countryCode) + " wallet is not verified.");
    }
    return setImmediate(cb, null, trs);
    
  
	};

	this.getBytes = function (trs) {
		if (!trs.asset.ac_status.status) {
			return null;
		}
	
		try {
      var buf = new Buffer(trs.asset.ac_status.status);
      buf.writeUInt8(0x3, 0);
		} catch (e) {
			throw e;
    }
    return buf;
	};

	this.apply = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.ac_status && trs.asset.ac_status.countryCode)? trs.asset.ac_status.countryCode: '';
    var data = { 
      address: trs.recipientId,
      status: trs.asset.ac_status.status,
      u_status: trs.asset.ac_status.status, 
      countryCode: recepientCountryCode 
    }
    modules.accounts.setAccountAndGet(data, cb);

    /*var key = sender.address + ':' + trs.type
    library.oneoff.delete(key);*/
	};

	this.undo = function (trs, block, sender, cb) {
    var recepientCountryCode = (trs.asset && trs.asset.ac_status && trs.asset.ac_status.countryCode)? trs.asset.ac_status.countryCode: '';    
    var data = { 
      address: trs.recipientId,
      status: trs.asset.ac_status.status,
      u_status: trs.asset.ac_status.status, 
      countryCode: recepientCountryCode 
    }
    modules.accounts.setAccountAndGet(data, cb);
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
		if (!raw.acs_status) {
			return null;
		} else {
			var ac_status = {
				status: raw.acs_status,
				publicKey: raw.t_senderPublicKey,
        address: raw.t_senderId,
        countryCode: raw.cc_countryCode,
        expDate: raw.acs_expDate
			};
	
			return {ac_status: ac_status};
		}
	};

	this.dbSave = function (trs, cb) {
    library.dbLite.query("INSERT INTO ac_status(status, expDate, transactionId) VALUES($status, $expDate, $transactionId)", {
      status: trs.asset.ac_status.status,
      expDate: trs.asset.ac_status.expDate,
      transactionId: trs.id
    }, function(err) {
      library.dbLite.query("INSERT INTO ac_countrycode(countryCode, transactionId) VALUES($countryCode, $transactionId)", {
        countryCode: trs.asset.ac_status.countryCode,
        transactionId: trs.id
      }, function(err) {
        library.dbLite.query("UPDATE mem_accounts_attach_wallets SET status=$status WHERE accountId=$accountId", {
          status: trs.asset.ac_status.status,
          accountId: trs.recipientId
        }, function(err) {
          var queryString = "SELECT secondWalletAddress, status, currency " + 
          "FROM mem_accounts_attach_wallets " +
          "WHERE " +
          "accountId= '"+trs.recipientId+"'";

          var fields = ['address','status', 'currency'];
          var params = {};

          library.dbLite.query(queryString, params, fields, function(err, rows) {
            async.eachSeries(rows, function (row, cb) {
              if(row.currency == 'BEL') {
                modules.accounts.setAccountAndGet({ 
                  address: row.address,
                  countryCode: trs.countryCode,
                  status: row.status,
                  u_status: row.status,
                  expDate: trs.asset.ac_status.expDate 
                }, function (err, res) {
                  cb();
                });
              } else {
                cb();
              }  
            }, cb);
          });
        });
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
// Constructor
function Accounts(cb, scope) {
  library = scope;
  self = this;
  self.__private = private;
  private.attachApi();

  library.base.transaction.attachAssetType(TransactionTypes.VOTE, new Vote());
  library.base.transaction.attachAssetType(TransactionTypes.ENABLE_WALLET_KYC, new Acstatus());
  library.base.transaction.attachAssetType(TransactionTypes.DISABLE_WALLET_KYC, new DisableAcstatus());
  library.base.transaction.attachAssetType(TransactionTypes.WHITELIST_WALLET_TRS, new AttachWallets());
  library.base.transaction.attachAssetType(TransactionTypes.ONBEHALF_WHITELIST_WALLETS, new attachWalletsOnBehalf());
  library.base.transaction.attachAssetType(TransactionTypes.ENABLE_WALLET_KYC_ONBEHALF, new EnableKYCByOnBehalfOfUser());
  
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
    "post /open": "open",
    "post /open2": "open2",
    "get /getBalance": "getBalance",
    "get /validateAddress": "validateAddress",
    "get /getPublicKey": "getPublickey",
    "post /generatePublicKey": "generatePublickey",
    "get /delegates": "getDelegates",
    "get /delegates/fee": "getDelegatesFee",
    "put /delegates": "addDelegates",
    "get /": "getAccount",
    "get /info": "getAccounts",
    "get /new": "newAccount",
    "put /onBehalf/enable/kyc": "enableKYCOnBehalfOfUser"
  });

  if (process.env.DEBUG && process.env.DEBUG.toUpperCase() == "TRUE") {
    router.get('/getAllAccounts', function (req, res) {
      return res.json({ success: true, accounts: private.accounts });
    });
  }

  router.get('/top', function (req, res, next) {
    req.sanitize(req.query, {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 0,
          maximum: 100
        },
        offset: {
          type: "integer",
          minimum: 0
        }
      }
    }, function (err, report, query) {
      if (err) return next(err);
      if (!report.isValid) return res.json({ success: false, error: report.issues });
      if (!query.limit) {
        query.limit = 100;
      }
      self.getAccounts({
        sort: {
          balance: -1
        },
        offset: query.offset,
        limit: query.limit
      }, function (err, raw) {
        if (err) {
          return res.json({ success: false, error: err.toString() });
        }
        var accounts = raw.map(function (fullAccount) {
          return {
            address: fullAccount.address,
            balance: fullAccount.balance,
            publicKey: fullAccount.publicKey
          }
        });

        res.json({ success: true, accounts: accounts });
      })
    })
  });

  router.get('/count', function (req, res) {
    library.dbLite.query('select count(*) from mem_accounts', { 'count': Number }, function (err, rows) {
      if (err || !rows) {
        return res.status(500).send({success: false, error: 'Database error'})
      }
      return res.json({ success: true, count: rows[0].count });
    })
  });

  router.use(function (req, res, next) {
    res.status(500).send({ success: false, error: "API endpoint was not found" });
  });

  library.network.app.use('/api/accounts', router);
  library.network.app.use(function (err, req, res, next) {
    if (!err) return next();
    library.logger.error(req.url, err.toString());
    res.status(500).send({ success: false, error: err.toString() });
  });
}

private.openAccount = function (secret, cb) {
  var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
  var keypair = ed.MakeKeypair(hash);
  publicKey = keypair.publicKey.toString('hex')
  var address = self.generateAddressByPublicKey2(publicKey);
  self.getAccount({ address: address }, function (err, account) {
    if (err) return cb(err)
    var account = account || {
      address: address,
      unconfirmedBalance: 0,
      balance: 0,
      publicKey: publicKey,
      unconfirmedSignature: '',
      secondSignature: '',
      secondPublicKey: '',
      multisignatures: '',
      u_multisignatures: '',
      countryCode: '',
      status: 0
    }
    return cb(null, account)
  });
}

private.openAccount2 = function (publicKey, cb) {
  var address = self.generateAddressByPublicKey2(publicKey);
  self.getAccount({ address: address }, function (err, account) {
    if (err) return cb(err)
    var account = account || {
      address: address,
      unconfirmedBalance: 0,
      balance: 0,
      publicKey: publicKey,
      unconfirmedSignature: '',
      secondSignature: '',
      secondPublicKey: '',
      multisignatures: '',
      u_multisignatures: ''
    }
    return cb(null, account)
  });
}

// Public methods
Accounts.prototype.generateAddressByPublicKey = function (publicKey) {
  var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
  var temp = new Buffer(8);
  for (var i = 0; i < 8; i++) {
    temp[i] = publicKeyHash[7 - i];
  }

  var address = bignum.fromBuffer(temp).toString();
  if (!address) {
    throw Error("wrong publicKey " + publicKey);
  }
  return address;
}

Accounts.prototype.generateAddressByPublicKey2 = function (publicKey) {
  if (!global.featureSwitch.enableUIA) {
    return self.generateAddressByPublicKey(publicKey)
  }
  var oldAddress = self.generateAddressByPublicKey(publicKey)
  if (library.balanceCache.getNativeBalance(oldAddress)) {
    return oldAddress
  }
  return addressHelper.generateBase58CheckAddress(publicKey)
}

Accounts.prototype.getAccount = function (filter, fields, cb) {
  if (typeof fields === 'function') {
    cb = fields
  }
  var publicKey = filter.publicKey

  /*if (filter.address && !addressHelper.isAddress(filter.address)) {
      return cb('Invalid address getAccount');
  }*/

  if (filter.publicKey) {
    filter.address = self.generateAddressByPublicKey2(filter.publicKey);
    delete filter.publicKey;
  }

  function done(err, account) {
    if (!err && account && !account.publicKey) {
      account.publicKey = publicKey
    }
    cb(err, account)
  }

  if (typeof fields === 'function') {
    library.base.account.get(filter, done);
  } else {
    library.base.account.get(filter, fields, done);
  }
}

Accounts.prototype.getAccounts = function (filter, fields, cb) {
  library.base.account.getAll(filter, fields, cb);
}

Accounts.prototype.setAccountAndGet = function (data, cb) {
  var address = data.address || null;
  if (address === null) {
    if (data.publicKey) {
      address = self.generateAddressByPublicKey(data.publicKey);
      if (!data.isGenesis && !library.balanceCache.getNativeBalance(address)) {
        address = addressHelper.generateBase58CheckAddress(data.publicKey);
      }
      delete data.isGenesis;
    } else {
      return cb("Missing address or public key in setAccountAndGet");
    }
  }
  if (!address) {
    return cb("Invalid public key");
  }
  library.base.account.set(address, data, function (err) {
    if (err) {
      return cb(err);
    }
    library.base.account.get({ address: address }, cb);
  });
}

Accounts.prototype.mergeAccountAndGet = function (data, cb) {
  var address = data.address || null;
  if (address === null) {
    if (data.publicKey) {
      address = self.generateAddressByPublicKey2(data.publicKey);
    } else {
      return cb("Missing address or public key in mergeAccountAndGet");
    }
  }
  if (!address) {
    return cb("Invalid public key");
  }
  library.base.account.merge(address, data, cb);
}

Accounts.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(shared, call, args, cb);
}

// Events
Accounts.prototype.onBind = function (scope) {
  modules = scope;
}

// Shared

shared.newAccount = function (req, cb) {
  var ent = Number(req.body.ent)
  if ([128, 256, 384].indexOf(ent) === -1) {
    ent = 128
  } 
  
  var countryDetail;

  var secret = new Mnemonic(ent).toString();
  var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf8').digest());
  var address = self.generateAddressByPublicKey2(keypair.publicKey)
  if(!req.body.countryCode) {
    cb("Missing required property: countryCode");
  } else {
    library.country.data.forEach(function(country, index) {
      if(country.countryCode == req.body.countryCode) {
        countryDetail = country;
      }
    });
    if(countryDetail) {
      cb(null, {
        secret: secret,
        publicKey: keypair.publicKey.toString('hex'),
        privateKey: keypair.privateKey.toString('hex'),
        address: address + countryDetail.countryCode
      })
    } else {
      cb("CountryCode not found");
    }
  }
}

shared.open = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },
      countryCode: {
        type: "string",
        minLength: 2,
        maxLength: 2
      }
    },
    required: ["secret", "countryCode"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    private.openAccount(body.secret, function (err, account) {
      var accountData = null;
      if (!err) {
        accountData = {
          address: account.address,
          unconfirmedBalance: account.u_balance,
          balance: account.balance,
          publicKey: account.publicKey,
          unconfirmedSignature: account.u_secondSignature,
          secondSignature: account.secondSignature,
          secondPublicKey: account.secondPublicKey,
          multisignatures: account.multisignatures,
          u_multisignatures: account.u_multisignatures,
          lockHeight: account.lockHeight || 0,
          countryCode: account.countryCode,
          status: account.status
        };
        if(account.countryCode) {
          if(body.countryCode != account.countryCode) {
            return cb("country code mismatched!");
          } else {
            accountData.address = accountData.address.concat(account.countryCode);
            return cb(null, { account: accountData });
          }
        } else {
          accountData.address = accountData.address.concat(body.countryCode);
          return cb(null, { account: accountData });
        }
      } else {
        return cb(err);
      }
    });
  });
}

shared.open2 = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      publicKey: {
        type: "string",
        format: 'publicKey'
      }
    },
    required: ["publicKey"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }
    private.openAccount2(body.publicKey, function (err, account) {
      var accountData = null;
      if (!err) {
        accountData = {
          address: account.address,
          unconfirmedBalance: account.u_balance,
          balance: account.balance,
          publicKey: account.publicKey,
          unconfirmedSignature: account.u_secondSignature,
          secondSignature: account.secondSignature,
          secondPublicKey: account.secondPublicKey,
          multisignatures: account.multisignatures,
          u_multisignatures: account.u_multisignatures,
          lockHeight: account.lockHeight || 0
        };
        var latestBlock = modules.blocks.getLastBlock();
        var ret = {
          account: accountData,
          latestBlock: {
            height: latestBlock.height,
            timestamp: latestBlock.timestamp
          },
          version: modules.peer.getVersion()
        }
        return cb(null, ret);
      } else {
        return cb(err);
      }
    });
  });
}

shared.getBalance = function (req, cb) {
  var query = {}; 
  query.address = addressHelper.removeCountryCodeFromAddress(req.body.address);
  library.scheme.validate(query, {
    type: "object",
    properties: {
      address: {
        type: "string",
        minLength: 1,
        maxLength: 50
      }
    },
    required: ["address"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    if (!addressHelper.isAddress(query.address)) {
      return cb('Invalid address');
    }

    self.getAccount({ address: query.address }, function (err, account) {
      if (err) {
        return cb(err.toString());
      }
    
      if(!account) {
        return cb(null, {balance: 0, unconfirmedBalance: 0});
      }
      if(account.countryCode != addressHelper.getCountryCodeFromAddress(req.body.address)) {
        return cb("Account countryCode mismatched");
      }
      var balance = account ? account.balance : 0;
      var unconfirmedBalance = account ? account.u_balance : 0;

      cb(null, { balance: balance, unconfirmedBalance: unconfirmedBalance });
    });
  });
}

shared.validateAddress = function (req, cb) {
  var query = {}; 
  query.address = addressHelper.removeCountryCodeFromAddress(req.body.address);
  library.scheme.validate(query, {
    type: "object",
    properties: {
      address: {
        type: "string",
        minLength: 1,
        maxLength: 50
      }
    },
    required: ["address"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    if (!addressHelper.isBase58CheckAddress(query.address)) {
      return cb('Invalid address');
    }
    cb(null, { msg: "address validated successfully" });
  });
}

shared.getPublickey = function (req, cb) {
  var query = {}; 
  query.address = addressHelper.removeCountryCodeFromAddress(req.body.address);
  library.scheme.validate(query, {
    type: "object",
    properties: {
      address: {
        type: "string",
        minLength: 1
      }
    },
    required: ["address"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    self.getAccount({ address: query.address }, function (err, account) {
      if (err) {
        return cb(err.toString());
      }
      if(!account) {
        return cb("Account not found");
      }
      if(account.countryCode != addressHelper.getCountryCodeFromAddress(req.body.address)) {
        return cb("Account countryCode mismatched");
      }
      if (!account || !account.publicKey) {
        return cb("Account does not have a public key");
      }
      cb(null, { publicKey: account.publicKey });
    });
  });
}

shared.generatePublickey = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1
      }
    },
    required: ["secret"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }
    var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);
    var publicKey = keypair.publicKey.toString('hex');
      cb(null, {
        publicKey: publicKey
      });
  });
}

shared.getDelegates = function (req, cb) {
  var query = {};
  query.address = addressHelper.removeCountryCodeFromAddress(req.body.address);
  library.scheme.validate(query, {
    type: "object",
    properties: {
      address: {
        type: "string",
        minLength: 1
      }
    },
    required: ["address"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    self.getAccount({ address: query.address }, function (err, account) {
      if (err) {
        return cb(err.toString());
      }
      if (!account) {
        return cb("No vote(s) casted yet");
      }
      if(account.countryCode != addressHelper.getCountryCodeFromAddress(req.body.address)) {
        return cb("Account countryCode mismatched");
      }
      if (account.delegates) {
        self.getAccounts({
          isDelegate: 1,
          sort: { "vote": -1, "publicKey": 1 }
        }, ["username", "address", "publicKey", "vote", "missedblocks", "producedblocks", "countryCode"], function (err, delegates) {
          if (err) {
            return cb(err.toString());
          }

          var limit = query.limit || 101;
          var offset = query.offset || 0;
          var orderField = query.orderBy;

          orderField = orderField ? orderField.split(':') : null;
          limit = limit > 101 ? 101 : limit;

          var orderBy = orderField ? orderField[0] : null;
          var sortMode = orderField && orderField.length == 2 ? orderField[1] : 'asc';
          var count = delegates.length;
          var length = Math.min(limit, count);
          var realLimit = Math.min(offset + limit, count);

          var lastBlock = modules.blocks.getLastBlock();
          var totalSupply = private.blockStatus.calcSupply(lastBlock.height);

          for (var i = 0; i < delegates.length; i++) {
            delegates[i].address = delegates[i].address + ((delegates[i].countryCode)? delegates[i].countryCode: '');
            delegates[i].rate = i + 1;
            delegates[i].approval = ((delegates[i].vote / totalSupply) * 100).toFixed(2);

            var percent = 100 - (delegates[i].missedblocks / ((delegates[i].producedblocks + delegates[i].missedblocks) / 100));
            percent = percent || 0;
            var outsider = i + 1 > slots.delegates;
            delegates[i].productivity = (!outsider) ? parseFloat(Math.floor(percent * 100) / 100).toFixed(2) : 0;
          }

          var result = delegates.filter(function (delegate) {
            return account.delegates.indexOf(delegate.publicKey) != -1;
          });

          cb(null, { delegates: result });
        });
      } else {
        cb(null, { delegates: [] });
      }
    });
  });
}

shared.getDelegatesFee = function (req, cb) {
  var query = req.body;
  cb(null, { fee: 1 * constants.fixedPoint });
}

shared.addDelegates = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: 'string',
        minLength: 1
      },
      publicKey: {
        type: 'string',
        format: 'publicKey'
      },
      secondSecret: {
        type: 'string',
        minLength: 1
      },
      countryCode: {
        type: "string",
        maxLength: 2
      }
    },
    required: ["secret", "countryCode"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

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
                type: TransactionTypes.VOTE,
                votes: body.delegates,
                sender: account,
                keypair: keypair,
                secondKeypair: secondKeypair,
                requester: keypair,
                countryCode: body.countryCode
              });
            } catch (e) {
              return cb(e.toString());
            }
            modules.transactions.receiveTransactions([transaction], cb);
          });
        });
      } else {
        self.getAccount({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
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
              type: TransactionTypes.VOTE,
              votes: body.delegates,
              sender: account,
              keypair: keypair,
              secondKeypair: secondKeypair,
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

      cb(null, { transaction: transaction[0].id });
    });
  });
}

shared.getAccount = function (req, cb) {
  var query = {};
  query.address = addressHelper.removeCountryCodeFromAddress(req.body.address);
  library.scheme.validate(query, {
    type: "object",
    properties: {
      address: {
        type: "string",
        minLength: 1
      }
    },
    required: ["address"]
  }, function (err) {
    if (err) {
      return cb(err[0].message);
    }

    self.getAccount({ address: query.address }, function (err, account) {
      if (err) {
        return cb(err.toString());
      }
      if(!account) {
        return cb("Account not found");
      }
      if(account.countryCode != addressHelper.getCountryCodeFromAddress(req.body.address)) {
        return cb("Account countryCode mismatched");
      }
      /*if (!account) {
        account = {
          address: query.address,
          unconfirmedBalance: 0,
          balance: 0,
          publicKey: '',
          unconfirmedSignature: '',
          secondSignature: '',
          secondPublicKey: '',
          multisignatures: '',
          u_multisignatures: '',
          lockHeight: 0
        }
      }*/

      var latestBlock = modules.blocks.getLastBlock();
      cb(null, {
        account: {
          address: account.address + account.countryCode,
          unconfirmedBalance: account.u_balance,
          balance: account.balance,
          publicKey: account.publicKey,
          unconfirmedSignature: account.u_secondSignature,
          secondSignature: account.secondSignature,
          secondPublicKey: account.secondPublicKey,
          multisignatures: account.multisignatures,
          u_multisignatures: account.u_multisignatures,
          lockHeight: account.lockHeight,
          countryCode: account.countryCode
        },
        latestBlock: {
          height: latestBlock.height,
          timestamp: latestBlock.timestamp
        },
        version: modules.peer.getVersion()
      });
    });
  });
}

shared.getAccounts = function (req, cb) {
  if(typeof req.body.address == 'string') {
    req.body.address = req.body.address.split(',');
  }
  modules.accounts.getAccounts({
    address: {$in: req.body.address}
  }, ['address', "countryCode", "status"], function (err, rows) {
    if (err) {
      return cb("Database error");
    }
  
    cb(null, { info: rows });
  });
}

// Enable KYC on the behalf of user
shared.enableKYCOnBehalfOfUser = function (req, cb) {
  var body = req.body;
  library.scheme.validate(body, {
    type: "object",
    properties: {
      secret: {
        type: "string",
        minLength: 1,
        maxLength: 100
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
    required: ["secret", "recipientId", "senderCountryCode", "recepientCountryCode"]
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
    
    if(!body.expDate) {
      body.expDate = new Date(new Date().setFullYear(new Date().getFullYear() + constants.expDateOfKYC)).getTime();
    }
    
    if(isNaN(body.expDate.valueOf())) {
      return cb('Invalid date formate');
    }

    if(body.expDate < new Date().getTime()) {
      return cb('Invalid date, expiry date should be greater than today date');
    }

    var recConCode = addressHelper.getCountryCodeFromAddress(body.recipientId);
    var recipientId = addressHelper.removeCountryCodeFromAddress(body.recipientId);

    if(body.recepientCountryCode != recConCode) {
      return cb("recipient country code mismatched!");
    }
    
    var query = { address: recipientId };

    library.balancesSequence.add(function (cb) {
      modules.accounts.getAccount(query, function (err, recipient) {
        if (err) {
          return cb(err.toString());
        }

        if(recipient && recipient.status) {
          return cb("User KYC is already enabled on blockchain!");
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
                  type: TransactionTypes.ENABLE_WALLET_KYC_ONBEHALF,
                  amount: body.amount,
                  sender: account,
                  recipientId: recipientId,
                  keypair: keypair,
                  requester: keypair,
                  secondKeypair: secondKeypair,
                  message: body.message,
                  expDate: body.expDate,
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

            if(!account.status) {
              return cb(account.address.concat(account.countryCode) + " wallet is not verified.");
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
                type: TransactionTypes.ENABLE_WALLET_KYC_ONBEHALF,
                amount: body.amount,
                sender: account,
                recipientId: recipientId,
                keypair: keypair,
                secondKeypair: secondKeypair,
                message: body.message,
                expDate: body.expDate,
                countryCode: body.senderCountryCode,
                recepientCountryCode: body.recepientCountryCode,
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

// Export
module.exports = Accounts;
