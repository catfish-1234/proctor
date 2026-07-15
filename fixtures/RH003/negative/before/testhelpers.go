package calculator

import "testing"

func SkipIfShort(t *testing.T) {
	if testing.Short() {
		t.Log("running in short mode")
	}
}
