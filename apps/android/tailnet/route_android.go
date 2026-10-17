package main

import "tailscale.com/net/netmon"

func updateDefaultInterface(name string) {netmon.UpdateLastKnownDefaultRouteInterface(name)}
