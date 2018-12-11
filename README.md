
rld's first KYC compliant Blockchain : http://www.belrium.com

- - -

# Belrium

Belrium system is a decentralized application platform, which is designed to lower the threshold for developers, such as using JavaScript as develop language, supporting relational database to save transaction data, and making DAPP development be similar with traditional Web application. It is sure that these characteristics are very attractive to developers and SMEs. The ecosystem of the whole platform cannot be improved until developers make a huge progress on productivity. Also, Belrium platform is designed to be open for various fields, not limited to some particular parts such as finance, file storage, or copyright proof. It provides underlying and abstract API which can be combined freely to create different types of applications. In consensus mechanism, Belrium inherits and enhances DPOS algorithm, by which the possibility of forks and risk of duplicate payments would be significantly reduced. Furthermore, Belrium sidechain mode not only can mitigate the pressure of blockchain expansion, but also make DAPP more flexible and personal. Belrium system, as a proactive, low-cost and full stack solution, will surely be a next generation incubator of decentralized applications.


## System Dependency

- nodejs v6.2.0+
- npm 3.10+ (not cnpm)
- node-gyp v3.6.2+ (suggested)
- sqlite v3.8.2+
- g++
- libssl

<h1><a id="Steps_to_setup_new_belrium_mining_node_0"></a>Steps to setup new belrium mining node:</h1>
<ol>
<li>Register and create wallet on <a href="http://app.belrium.io">app.belrium.io</a></li>
<li>Verify your email and activate your wallet.This information is purely confidential. Please do not disclose this with anyone.</li>
<li>You can now upload documents based on your geography and get your wallet compliance checked.Once your wallet is compliant you can start transacting on the belrium network.</li>
<li>Get the source code hosted at -</li>
</ol>
<pre><code>https://github.com/Belrium/belrium_miner.git
</code></pre>
<ol start="5">
<li>Run the following commands to install the required software dependencies.<br>
System Dependency<br>
nodejs v6.3+,npm 3.10+ (not cnpm),node-gyp v3.6.2+ (suggested),sqlite v3.8.2+,g++,libssl,</li>
</ol>
<h1><a id="Installation_dependencies_for_ubuntu_1404x_or_higher_using_bash_script_12"></a>Installation dependencies for ubuntu 14.04.x or higher using bash script.</h1>
<pre><code>   sudo ./belrium_manager.bash install
</code></pre>
<h1><a id="Installation_dependencies_for_ubuntu_1404x_or_higher_manually_16"></a>Installation dependencies for ubuntu 14.04.x or higher manually.</h1>
<h1><a id="Install_dependency_package_18"></a>Install dependency package</h1>
<pre><code>   sudo apt-get install curl sqlite3 ntp wget git libssl-dev openssl make gcc g++ autoconf automake python build-essential -y
</code></pre>
<h1><a id="libsodium_for_ubuntu_1404_22"></a>libsodium for ubuntu 14.04</h1>
<pre><code>   sudo apt-get install libtool -y
</code></pre>
<h1><a id="libsodium_for_ubuntu_1604_26"></a>libsodium for ubuntu 16.04</h1>
<pre><code>   sudo apt-get install libtool libtool-bin -y
</code></pre>
<h1><a id="Install_node_and_npm_for_current_user_42"></a>Install node and npm for current user</h1>
<pre><code>   
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs

For other operating systems follow : https://nodejs.org/en/download/package-manager/
</code></pre>
<h1><a id="Install_node_packages_46"></a>Install node packages</h1>
<pre><code>  npm install
</code></pre>

## Installation on docker.

[Please install Docker firstly](https://store.docker.com/search?offering=community&type=edition)

```
# pull belrium code docker image
docker pull belriumplatform/belrium:v1.3.0
# run docker and belrium
docker run -i -t --name belrium1.3.0 -p 4096:4096 belriumplatform/belrium:v1.3.0 /bin/bash
root@e149b6732a48:/# cd /data/belrium && ./belrium start
Belrium server started as daemon ...
```

<ol start="6">
<li>To connect with the Belrium blockchain, new node need to change the setting file (Belrium-&gt;config.json) with following information.</li>
</ol>
<pre><code>{
    &quot;port&quot;: 9305,
    &quot;address&quot;: &quot;0.0.0.0&quot;,
    &quot;publicIp&quot;: &quot;&quot;,
    &quot;logLevel&quot;: &quot;debug&quot;,
    &quot;magic&quot;: &quot;594fe0f3&quot;,
    &quot;api&quot;: {
        &quot;access&quot;: {
            &quot;whiteList&quot;: []
        }
    },
    &quot;peers&quot;: {
        &quot;list&quot;: [{
            &quot;ip&quot;: &quot;52.66.157.170&quot;,
            &quot;port&quot;: 9305
        }],
        &quot;blackList&quot;: [],
        &quot;options&quot;: {
            &quot;timeout&quot;: 4000
        }
    },
    &quot;walletVerificationAPI&quot;: {
        &quot;enable&quot;: false
    },
    &quot;forging&quot;: {
        &quot;secret&quot;: [],
         &quot;access&quot;: {
            &quot;whiteList&quot;: ["127.0.0.1"]
        }
        },
    &quot;loading&quot;: {
        &quot;verifyOnLoading&quot;: false,
        &quot;loadPerIteration&quot;: 5000
    },
    &quot;dapp&quot;: {
        &quot;masterpassword&quot;: &quot;&quot;,
        &quot;params&quot;: {}
    },
    &quot;ssl&quot;: {
        &quot;enabled&quot;: false,
        &quot;options&quot;: {
            &quot;port&quot;: 443,
            &quot;address&quot;: &quot;0.0.0.0&quot;,
            &quot;key&quot;: &quot;./ssl/server.key&quot;,
            &quot;cert&quot;: &quot;./ssl/server.crt&quot;
        }
    },
    &quot;url&quot;: {
        &quot;kycUrl&quot;: &quot;https://kyc.belrium.io&quot;
    }
}

</code></pre>
<ol start="7">
<li>Run the following script to start the node</li>
</ol>
<pre><code>./belrium_manager.bash start
</code></pre>
<img width="487" alt="screen shot 2018-07-30 at 5 44 52 pm" src="https://user-images.githubusercontent.com/41406142/43397108-54f24e84-9421-11e8-8f8c-91173245667b.png">
<ol start="9">
<li>Run the following command to stop the node</li>
</ol>
<pre><code>./belrium_manager.bash stop
</code></pre>
<img width="477" alt="screen shot 2018-07-30 at 5 47 35 pm" src="https://user-images.githubusercontent.com/41406142/43397107-54c01bc6-9421-11e8-872e-a7b4c8ec6dbb.png">
<ol start="8">
<li>Run the following script to know the status</li>
</ol>
<pre><code>./belrium_manager.bash status
</code></pre>
<img width="494" alt="screen shot 2018-07-30 at 5 35 39 pm" src="https://user-images.githubusercontent.com/41406142/43397109-5519e430-9421-11e8-9d56-e49bcee47ea0.png">

## Run

```
cd belrium && node app.js
or
cd belrium && ./belrium_manager.bash start
```
Then you can open ```http://localhost:9305``` in you browser.

## Usage

```
node app.js --help

  Usage: app [options]

  Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -c, --config <path>        Config file path
    -p, --port <port>          Listening port number
    -a, --address <ip>         Listening host name or ip
    -b, --blockchain <path>    Blockchain db path
    -g, --genesisblock <path>  Genesisblock path
    -x, --peers [peers...]     Peers list
    -l, --log <level>          Log level
    -d, --daemon               Run belrium node as daemon
    --reindex                  Reindex blockchain
    --base <dir>               Base directory
```

