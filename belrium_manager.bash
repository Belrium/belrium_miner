#!/usr/bin/env bash
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export LANGUAGE=en_US.UTF-8
version="1.0.0"
os_version=$(lsb_release -sr)

cd "$(cd -P -- "$(dirname -- "$0")" && pwd -P)"
root_path=$(pwd)

mkdir -p $root_path/logs
logfile=$root_path/logs/belrium_manager.log
ipfs_log=$root_path/logs/ipfs.log


readonly PROG_DIR=$(pwd)
readonly PID_FILE=$PROG_DIR/bel.pid


function install_prereq() {
	if [[ ! -f /usr/bin/sudo ]]; then
		echo "Install sudo before continuing. Issue: apt-get install sudo as root user."
		echo "Also make sure that your user has sudo access."
	fi

	sudo id &> /dev/null || { exit 1; };

	echo ""
	echo "-------------------------------------------------------"
	echo "Belrium installer script. Version: $version"
	echo "-------------------------------------------------------"
	
	echo -n "Running: apt-get update... ";
	sudo apt-get update  &> /dev/null || \
	{ echo "Could not update apt repositories. Run apt-get update manually. Exiting." && exit 1; };
	echo -e "done.\n"

	echo "Running sudo apt install python3-argcomplete/xenial --force";
	sudo apt install python3-argcomplete/xenial &>> $logfile || { echo "Could not install python3-argcomplete/xenial. Exiting." && exit 1; }
    echo -e "done.\n"

	echo -n "Running: sudo apt-get install curl sqlite3 ntp wget git libssl-dev openssl make gcc g++ autoconf automake python build-essential -y ... ";
	sudo apt-get install curl sqlite3 ntp wget git libssl-dev openssl make gcc g++ autoconf automake python build-essential -y &>> $logfile || \
	{ echo "Could not install packages prerequisites. Exiting." && exit 1; };
	echo -e "done.\n"

	# libsodium for ubuntu 14.04
	if [ $os_version = "14.04" ];then
	    echo "Running sudo apt-get install libtool -y";
	    sudo apt-get install libtool -y &>> $logfile || { echo "Could not install libtool. Exiting." && exit 1; }
    	    echo -e "done.\n"

	# libsodium for ubuntu 16.04
	elif [ $os_version = "16.04" ];then
	    echo "Running sudo apt-get install libtool libtool-bin -y";
	    sudo apt-get install libtool libtool-bin -y &>> $logfile || { echo "Could not install libtool libtool-bin. Exiting." && exit 1; }
            echo -e "done.\n"
	else
	    echo "Running sudo apt-get install libtool libtool-bin -y";
	    sudo apt-get install libtool libtool-bin -y &>> $logfile || { echo "Could not install libtool libtool-bin. Exiting." && exit 1; }
            echo -e "done.\n"
	fi
	
}

function install_node_npm() {

    echo -n "Installing nodejs and npm... "
    curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash - &>> $logfile
    sudo apt-get install -y -qq nodejs &>> $logfile || { echo "Could not install nodejs and npm. Exiting." && exit 1; }
    echo -e "done.\n" && echo -n "Installing grunt-cli... "
    sudo npm install grunt-cli -g &>> $logfile || { echo "Could not install grunt-cli. Exiting." && exit 1; }
    echo -e "done.\n" && echo -n "Installing bower... "
    sudo npm install bower -g &>> $logfile || { echo "Could not install bower. Exiting." && exit 1; }
    echo -e "done.\n" && echo -n "Installing process management software... "
    sudo npm install forever -g &>> $logfile || { echo "Could not install process management software(forever). Exiting." && exit 1; }
    echo -e "done.\n"

    return 0;
}

function install_belrium() {

    echo -n "Installing Belrium core... "
    npm install --production &>> $logfile || { echo "Could not install BELRIUM, please check the log directory. Exiting." && exit 1; }
    #npm install nan@2.2.1 &>> $logfile || { echo "Could not install BELRIUM, please check the log directory. Exiting." && exit 1; }
    npm install npm install sodium --unsafe-perm &>> $logfile || { echo "Could not install BELRIUM, please check the log directory. Exiting." && exit 1; }
    echo -e "done.\n"

    return 0;
}

function install() {
	install_prereq
	install_node_npm
	install_belrium
}

function read_port() {
  echo `cat $PROG_DIR/config.json |grep '"port"'|head -n 1| awk -F "[:,]" '{print$2}'|tr -d ' '`
}

function is_running() {
  test -f $PID_FILE && ps -p $(cat $PID_FILE) > /dev/null
}

function status() {
  if is_running; then
    echo "Belrium server is running"
  else
    echo "Belrium server is not running"
  fi
}

function start() {
  if is_running; then
    echo "Belrium server is already started"
  else
    rm -f $PROG_DIR/bel.pid
    node $PROG_DIR/app.js --base $PROG_DIR --daemon $@
  fi
}

function stop() {
  local pid
  if test -f $PID_FILE; then
    pid=$(cat $PID_FILE)
  fi
  if [ -n "$pid" ] && ps -p "$pid" > /dev/null; then
    kill $pid
    sleep 1
    i=1
    while ps -p $pid > /dev/null; do
      if [ $i == 5 ]; then
        kill -9 $pid
        echo "Belrium server killed"
      fi
      echo "Still waiting for Belrium server to stop ..."
      sleep 1
      ((i++))
    done
    echo "Belrium server stopped"
  else
    echo "Belrium server is not running"
  fi
  rm -f $PID_FILE
}

function restart() {
  stop
  start
}

function ismainnet(){
  magic=$(cat $PROG_DIR/config.json | grep magic | awk -F: '{print $2}' | cut -d \" -f2)
  net="testnet"
  echo "net is $net"
}

function version() {
  node $PROG_DIR/app.js --version
}

function check_os() {
  os_num=`cat /etc/os-release | grep '\"Ubuntu\"'  | wc -l`
  if [ $os_num -ne 1 ];then
    echo "Linux is not Ubuntu, please configure manually!" && exit 1
  fi
}

function configure() {
  check_os
  sudo bash $PROG_DIR/init/install_deps.sh
  sudo bash $PROG_DIR/init/config_ntp.sh
  sudo bash $PROG_DIR/init/config_monitor.sh
}

function enable() {
  local secret="$@"
  local port=`read_port`
  curl -k -H "Content-Type: application/json" -X POST -d '{"secret":"'"$secret"'"}' localhost:$port/api/delegates/forging/enable
}

function main() {
  export PATH=$PROG_DIR/bin:$PATH
  local cmdType=`type -t $1`
  if [ $cmdType == "function" ]; then
    eval $@
  else
    echo "Command not supported"
  fi
}

main $@
