import fs from "fs";
import { V2RAY_CORE_PATH, PROTOS_DIR } from "../config.js";

const mkdirAndCp = (originFile, targetFile) => { 
    let targetDir = targetFile.substring(0, targetFile.lastIndexOf("/"));
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(originFile, targetFile);
}
const cpProtoFiles = async (V2RAY_CORE_PATH, target_path) => {
    fs.readdirSync(V2RAY_CORE_PATH).forEach(file => {
        if (file.endsWith(".proto")) {
            mkdirAndCp(`${V2RAY_CORE_PATH}/${file}`, `${target_path}/${file}`);
        } else { 
            fs.statSync(`${V2RAY_CORE_PATH}/${file}`).isDirectory() && cpProtoFiles(`${V2RAY_CORE_PATH}/${file}`, `${target_path}/${file}`);
        }
    });
}
const main = async () => {
    cpProtoFiles(V2RAY_CORE_PATH, PROTOS_DIR);
    console.info("INFO: proto files sync done.");
}

main();