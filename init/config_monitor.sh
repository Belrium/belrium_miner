#!/bin/bash
#auth:lumpo
#date:2016-07-15

readonly INIT_DIR=$(readlink -m $(dirname $0))

function add_cron() {
	cnt=`cat /etc/crontab | grep 'belrium_monitor' | grep -v '#' | wc -l`
	if [ $cnt -eq 0 ];then
		echo "*/1 * * * * root $INIT_DIR/belrium_monitor.sh" >> /etc/crontab
		if [ $? -ne 0 ];then
			echo "Add belrium_monitor crontab err, please add it manually!" && exit 2
		fi
	fi
}

function main() {
	add_cron
	echo "Configure belrium_monitor crontab done."
}

main
