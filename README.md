# v2ray-manager

A v2ray manager, which can manage v2ray server and client. Use the grpc protocol to communicate with the v2ray server.

## Installation

```
npm install v2ray-manager
```

## Example

```
import { V2rayManager } from "v2ray-manager";

let v2rayManager = new V2rayManager("localhost:1007");

const main = async () => { 
    //add a trojan Inbound user
    let addInboundUser = await client.addUser("trojan", {
        "level": 0,
        "email": "test@test.com",
        "account": {
            "password": "test_pwd"
        }
    }, "proxy");

    console.log(addInboundUser);

    //remove a Inbound user
    let removeInboundUser = await client.removeUser("test@test.com", "proxy");

    console.log(removeInboundUser);

    //get stats by tag 'proxy'
    let stats = await client.getStats("inbound>>>proxy>>>traffic>>>downlink", false);

    console.log(stats);

    //get stats by email 'test@test.com'
    let userStats = await client.getStats("user>>>test@test.com>>>traffic>>>downlink", false);
    console.log(userStats);

    //query stats by pattern 'user'
    let patternStats = await client.queryStats("user", false);
    console.log(patternStats);

    //get system stats
    let sysStats = await client.getSysStats();
    console.log(sysStats);
}

```