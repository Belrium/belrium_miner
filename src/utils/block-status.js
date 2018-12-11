var constants = require('./constants.js');

function BlockStatus() {
  /*var milestones = [
	500000000,
	250000000,
	125000000,
	62500000,
	31250000,
	15625000,
	7812500,
	3906250,
	1953125,
	976562.5,
	488281.3,
	244140.6,
	122070.3,
	61035.2,
	30517.6,
	15258.8,
	7629.4,
	3814.7,
	1907.3,
	953.7,
	476.8,
	238.4,
	119.2,
	59.6,
	29.8,
	14.9,
	7.5,
	3.7,
	1.9,
	0.9
  ];

  var distance = 2100000, // Distance between each milestone
      rewardOffset = 1;*/ // Start rewards at block (n)

  if (global.Config.netVersion === 'mainnet') {
    rewardOffset = 2100000;
  }
  var milestones = constants.milestonesBelPerBlock;

  var distance = constants.blockHeightInterval; // Distance between each milestone
  var rewardOffset = 1; // Start rewards at block (n)

  var parseHeight = function (height) {
    height = parseInt(height);

    if (isNaN(height)) {
      throw new Error('Invalid block height');
    } else {
      return Math.abs(height);
    }
  };

  this.calcMilestone = function (height) {
    var location = Math.floor(parseHeight(height - rewardOffset) / distance),
        lastMile = milestones[milestones.length - 1];

    if (location > (milestones.length - 1)) {
      return milestones.lastIndexOf(lastMile);
    } else {
      return location;
    }
  };

  this.calcReward = function (height) {
    var height = parseHeight(height);

    if (height < rewardOffset || height <= 1) {
      return 0;
    } else {
      return milestones[this.calcMilestone(height)];
    }
  };

  this.calcSupply = function (height) {
    var height = parseHeight(height);
    height -= height % 101;
    var milestone = this.calcMilestone(height);
    var supply    = constants.initialSupply;
    var rewards   = [];

    if (height <= 0) {
      return supply;
    }
    var amount = 0, multiplier = 0;
    height = height - rewardOffset + 1;
    for (var i = 0; i < milestones.length; i++) {
      if (milestone >= i) {
        multiplier = milestones[i];

        if (height <= 0) {
          break; // Rewards not started yet
        } else if (height < distance) {
          amount = height % distance; // Measure distance thus far
        } else {
          amount = distance; // Assign completed milestone
        }
        rewards.push([amount, multiplier]);
        height -= distance; // Deduct from total height
      } else {
        break; // Milestone out of bounds
      }
    }
    if (height > 0) {
      rewards.push([height, milestones[milestones.length - 1]]);
    }

    for (i = 0; i < rewards.length; i++) {
      var reward = rewards[i];
      supply += reward[0] * reward[1];
    }

    if (rewardOffset <= 1) {
      supply -= milestones[0];
    }

    return supply;
  };
}

// Exports
module.exports = BlockStatus;
