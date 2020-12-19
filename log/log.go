package log

import (
	"os"

	"github.com/sirupsen/logrus"
)

func Init() {
	logrus.SetLevel(logrus.TraceLevel)
	logrus.SetOutput(os.Stdout)
	logrus.SetFormatter(&logrus.TextFormatter{
		ForceColors:   true,
		FullTimestamp: true,
	})
}

func Fatalf(f string, a ...interface{}) {
	logrus.Fatalf(f, a...)
}

func Errorf(f string, a ...interface{}) {
	logrus.Errorf(f, a...)
}

func Warnf(f string, a ...interface{}) {
	logrus.Warnf(f, a...)
}

func Infof(f string, a ...interface{}) {
	logrus.Infof(f, a...)
}

func Debugf(f string, a ...interface{}) {
	logrus.Debugf(f, a...)
}

func Tracef(f string, a ...interface{}) {
	logrus.Tracef(f, a...)
}
