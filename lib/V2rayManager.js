import grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";
import { PROTOS_DIR } from "../config.js";

const SERVICES_PROTO_PATH = {
    hanlder: "app/proxyman/command/command.proto",
    stats: "app/stats/command/command.proto",
    logger: "app/log/command/config.proto"
};
const SERVICES = {
    handler: "v2ray.core.app.proxyman.command.HandlerService",
    stats: "v2ray.core.app.stats.command.StatsService",
    logger: "v2ray.core.app.log.command.LoggerService"
};
const ACCOUNT_PROTO_PATH = {
    "torjan": "proxy/trojan/config.proto",
    "vmess": "proxy/vmess/account.proto",
    "vless": "proxy/vless/account.proto"
};

const PROXYMAN_OPERATIONS = {
    addUser: "v2ray.core.app.proxyman.command.AddUserOperation",
    removeUser: "v2ray.core.app.proxyman.command.RemoveUserOperation",
};

const ACCOUNTS = {
    "torjan": "v2ray.core.proxy.torjan.Account",
    "vmess": "v2ray.core.proxy.vmess.Account",
    "vless": "v2ray.core.proxy.vless.Account"
};

const RECEIVER_SETTING = "v2ray.core.app.proxyman.ReceiverConfig";
const PROXY_SETTINGS = {
    "trojan": "v2ray.core.proxy.trojan.ServerConfig",
    "vmess": "v2ray.core.proxy.vmess.inbound.Config",
    "vless": "v2ray.core.proxy.vless.inbound.Config",
};
const NEEDED_PROTOS = [
    "app/proxyman/config.proto",
    "proxy/vmess/inbound/config.proto",
    "proxy/vless/inbound/config.proto",
    "proxy/trojan/config.proto"
];

/**
 *  V2rayManager
 * @class
 * @classdesc V2rayManager
 * @param {string} grpcServerUrl - v2ray server grpc url
 * @example
 * const v2rayClient = new V2rayManager("localhost:10007");
 * 
**/

class V2rayManager {
    constructor(grpcServerUrl) {
        this.grpcServerUrl = grpcServerUrl;
        this.root = new protobuf.Root();
        this.#initProtobufRoot();
        this.services = {};
        this.#initServices();
    }
    #initProtobufRoot() {
        this.root.resolvePath = function (origin, target) {
            if (/^google\//.test(target))
                return null; // ignored
            return protobuf.util.path.resolve(`${PROTOS_DIR}/`, target || origin);
        }
    }
    #initServices() {
        this.root.loadSync(SERVICES_PROTO_PATH.hanlder);
        let HandlerServiceDefinition = this.root.lookup(SERVICES.handler);
        this.services.handler = this.#createGrpcClient(HandlerServiceDefinition);
        this.root.loadSync(SERVICES_PROTO_PATH.stats);
        let StatsServiceDefinition = this.root.lookup(SERVICES.stats);
        this.services.stats = this.#createGrpcClient(StatsServiceDefinition);
        this.root.loadSync(SERVICES_PROTO_PATH.logger);
        let LoggerServiceDefinition = this.root.lookup(SERVICES.logger);
        this.services.logger = this.#createGrpcClient(LoggerServiceDefinition);
        //load inbound&outbound config proto
        NEEDED_PROTOS.forEach(proto => {
            this.root.loadSync(proto);
        });

    }
    #createGrpcClient(ServiceDefinition) {
        const methods = Object.fromEntries(
            Object.entries(ServiceDefinition.methods).map(([name, method]) => {
                method.resolve();
                return [
                    name,
                    {
                        path: `${ServiceDefinition.fullName.slice(1)}/${name}`,
                        requestStream: method.requestStream,
                        responseStream: method.responseStream,
                        requestType: method.resolvedRequestType.ctor,
                        responseType: method.resolvedResponseType.ctor,
                        requestSerialize: (message) => {
                            let res = method.resolvedRequestType.encode(message).finish();
                            return res;
                        },
                        requestDeserialize: (bytes) => {
                            return method.resolvedRequestType.decode(bytes);
                        },
                        responseSerialize: (message) => {
                            return method.resolvedResponseType.encode(message).finish();
                        },
                        responseDeserialize: (bytes) => {
                            return method.resolvedResponseType.decode(bytes);
                        },
                    },
                ]
            })
        );
        const serviceName = ServiceDefinition.fullName.slice(1);
        const ClientConstructor = grpc.makeGenericClientConstructor(methods, serviceName);
        const client = new ClientConstructor(this.grpcServerUrl, grpc.credentials.createInsecure());
        return client;
    }
    #loadAnyMessage(type_url, message, protoPath) {
        if (protoPath) {
            this.root.loadSync(protoPath);
        }
        let AnyMessage = this.root.lookupType(type_url);
        let originMessage = AnyMessage.create(message);
        let verifiedRes = AnyMessage.verify(originMessage);
        if (verifiedRes) {
            this.#error("loadAnyMessage", verifiedRes);
        }
        let anyMessageBuffer = AnyMessage.encode(originMessage).finish();
        let anyMessage = {
            "type_url": type_url,
            "value": anyMessageBuffer
        };
        return anyMessage;
    }
    #verifyMessage(type_url, message, protoPath) {
        if (protoPath) {
            this.root.loadSync(protoPath);
        }
        let TheMessage = this.root.lookupType(type_url);
        let originMessage = TheMessage.create(message);
        let verifiedRes = TheMessage.verify(originMessage);
        if (verifiedRes) {
            this.#error("loadAnyMessage", verifiedRes);
            return false;
        }
        return true;
    }
    #responseToObject(message) {
        let messagePath = `${message.$type.parent.fullName.slice(1)}.${message.$type.name}`;
        let Message = this.root.lookupType(messagePath);
        return Message.toObject(message, {
            longs: String,
            enums: String,
            bytes: String,
        });
    }
    #error(method, error) {
        console.error(`[V2ray API] [${method}] Error: `, error.details || error);
    }

    //Stats api
    getSysStats() {
        return new Promise((resolve, reject) => {
            this.services.stats.GetSysStats({}, (error, response) => {
                if (error) {
                    this.#error("GetSysStats", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return false;
                }
                resolve(this.#responseToObject(response));
            });
        });
    }
    queryStats(pattern, reset) {
        pattern = pattern || "";
        reset = reset || false;
        return new Promise((resolve, reject) => {
            this.services.stats.QueryStats({
                patterns: [pattern],
                reset: reset,
                regexp: true
            }, (error, response) => {
                if (error) {
                    this.#error("QueryStats", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return;
                }
                resolve(this.#responseToObject(response));
            });
        });
    }
    getStats(name, reset) {
        return new Promise((resolve, reject) => {
            this.services.stats.GetStats({
                name: name,
                reset: reset
            }, (error, response) => {
                if (error) {
                    this.#error("GetStats", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return;
                }
                resolve(this.#responseToObject(response));
            });
        });
    }

    //Logger api
    restartLogger() {
        return new Promise((resolve, reject) => {
            this.services.logger.RestartLogger({
            }, (error, response) => {
                if (error) {
                    this.#error("RestartLogger", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return;
                }
                resolve(this.#responseToObject(response));
            });
        });
    }
    //Unstable interface
    followLog(resolve) {
        this.services.logger.FollowLog({
        }, (error, response) => {
            if (error) {
                this.#error("FollowLog", error);
                resolve({
                    error: {
                        code: error.code,
                        details: error.details
                    }
                });
                return;
            }
            resolve(this.#responseToObject(response));
        });
    }

    //Handler api
    #alterInbound(tag, operation) {
        return new Promise((resolve, reject) => {
            this.services.handler.AlterInbound({
                tag: tag,
                operation: operation
            }, (error, response) => {
                if (error) {
                    this.#error("AlterInbound", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return;
                }
                resolve(response);
            });
        });
    }
    //to do: don't know the outbound operation
    alterOutbound(tag, operation) {
        return new Promise((resolve, reject) => {
            this.services.handler.AlterOutbound({
                tag: tag,
                operation: operation
            }, (error, response) => {
                if (error) {
                    this.#error("AlterOutbound", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return;
                }
                resolve(response);
            });
        });
    }
    //to do: not work now
    addInbound(settings) {
        return new Promise((resolve, reject) => {
            let message = {
                inbound: {
                    tag: settings.tag,
                    receiver_settings: this.#loadAnyMessage(
                        RECEIVER_SETTING,
                        {
                            port_range: {
                                from: settings.port,
                                to: settings.port
                            },
                            listen: settings.listen.match(/\d+\.\d+\.\d+\.\d+/) ? ({ ip: settings.listen }) : ({ domain: settings.listen }),
                            allocation_strategy: settings.allocate || {},
                            stream_settings: settings.streamSettings || {},
                            receive_original_destination: false,
                            sniffing_settings: settings.sniffing || {}
                        }
                    ),
                    proxy_settings: this.#loadAnyMessage(
                        PROXY_SETTINGS[settings.protocol],
                        settings.settings
                    )
                }
            };
            this.services.handler.AddInbound(message, (error, response) => {
                if (error) {
                    this.#error("AddInbound", error);
                    resolve({
                        error: {
                            code: error.code,
                            details: error.details
                        }
                    });
                    return;
                }
                resolve(response);
            });
        });
    }
    async addInboundUser(accountType, user, tag) {
        let operation = this.#loadAnyMessage(
            PROXYMAN_OPERATIONS.addUser,
            {
                "user": {
                    "level": user.level || 0,
                    "email": user.email || "",
                    "account": this.#loadAnyMessage(
                        ACCOUNTS[accountType],
                        user.account || {},
                        ACCOUNT_PROTO_PATH.torjan
                    )
                }
            }
        );
        return this.#responseToObject(await this.#alterInbound(tag, operation));
    }
    async removeInboundUser(email, tag) {
        let operation = this.#loadAnyMessage(
            PROXYMAN_OPERATIONS.removeUser,
            {
                "email": email
            }
        );
        return this.#responseToObject(await this.#alterInbound(tag, operation));
    }
}

export { V2rayManager };

