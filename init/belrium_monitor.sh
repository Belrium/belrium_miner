#!/bin/bash
readonly PROG_DIR=$(readlink -m $(dirname $0))
belrium=$PROG_DIR/../belrium_manager.bash
log=$PROG_DIR/../logs/belrium_monitor.log

function auto_restart(){
	status=`$belrium status`
	if [ "$status" == "Belrium server is not running" ];then
		$belrium restart
		echo "`date +%F' '%H:%M:%S`[error]	Belrium server is not running and restarted" >> $log
	else
		echo "`date +%F' '%H:%M:%S`[info]	Belrium server is running" >> $log
	fi
	/etc/init.d/ntp stop
	sleep 2
	ntpdate pool.ntp.org >> $log
	/etc/init.d/ntp start
}

auto_restart
