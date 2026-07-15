package calculator

import "testing"

func SkipIfShort(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping in short mode")
	}
}
