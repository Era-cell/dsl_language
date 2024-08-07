import { deepGet, deepEqual, deepCopy } from './utilities.js';
import { operations } from './patchschema.js';
import { checkCondition } from './checkschema.js';

const getIterables = (schema, conditions) => {
    let iterative_indices = [null];
    for (let i=0; i<conditions.length; i++) {
        const path = conditions[i]["path"];
        if (path.includes({})) {
            const iterative_schema = deepGet(schema, path.slice(0, path.indexOf({})));
            if (Array.isArray(iterative_schema))  iterative_indices = Array.from({ length: iterative_schema.length }, (_, i) => iterative_schema.length - 1 - i);
            else iterative_indices = Object.keys(iterative_schema);
            break;
        }
    }
    return iterative_indices;
};

const checkCurlyPath = (conditions) => {
    for (let i=0; i<conditions.length; i++) {
        const path = conditions[i]["path"];
        if (path.includes({})) {
            return true;
        }
    }
    return false;
};

const getProcessedPath = (path, iterableKey) =>{
    const processed_path = [];
    for (const p of path) {
        if (typeof p === 'object') processed_path.push(iterableKey);
        else processed_path.push(p);
    }
    return processed_path;
}

const applyRule = (schema, rule, allWalks) => {
    const conditions = rule.condition;
    const transforms = rule.transform;

    const iterableIndices = getIterables(schema, conditions);
    for (const iterableKey of iterableIndices) {
        let conditionAgrees = true;
        for (const condition of conditions) {
            // path: ["properties", {}]  --> path: ["properties", foo] for1st iterableKey and so on
            const processed_path = getProcessedPath(condition["path"], iterableKey);
            if (!checkCondition({ "operation": condition.operation, "path": processed_path, "value": condition.value }, schema)) {
                conditionAgrees = false;
                break;
            }
        }
        if (conditionAgrees) {
            for (const transform of transforms) {
                if (transform.hasOwnProperty("path")){
                    const temp = [...transform["path"]];
                    transform["path"] = getProcessedPath(transform["path"], iterableKey);
                    const { operation, ...params } = transform;
                    operations[operation](schema, params)
                    transform["path"] = temp;
                }else{
                    const temp_from = [...transform["from"]];
                    const temp_to = [...transform["to"]];
                    transform["from"] = getProcessedPath(transform["from"], iterableKey);
                    transform["to"] = getProcessedPath(transform["to"], iterableKey);
                    const { operation, ...params } = transform;
                    operations[operation](schema, params)
                    processTransformWalk(schema, transform["from"], transform["to"], allWalks);
                    transform["from"] = temp_from;
                    transform["to"] = temp_to;
                }
            }
        }
    }
};

const processTransformWalk = (schema, from_path ,to_path, allWalks) =>{
    let temp_schema = deepCopy(schema);
    console.log(from_path, to_path);
    for (let i=0; i<to_path.length; i++) {
        if (to_path[i] === "-" && Array.isArray(temp_schema)) {
            to_path[i] = temp_schema.length - 1;
        }
        temp_schema = temp_schema[to_path[i]];
    }

    // Assuming the rules wil always have thier "from" length less than or equal to walks
    for (let i in allWalks) {
        if (from_path.every((val, index)=>allWalks[i].oldWalk[index]==val)) {
            allWalks[i].newWalk = to_path.concat(allWalks[i].oldWalk.slice(from_path.length));
            break;
        }
    }    
}   

const applyTest = (test, rule) => {
    const from = test["from"];
    console.log(from);
    applyRule(from, rule);
    console.log(from, test["to"]);
    return deepEqual(from, test["to"]);
}

const rule = {
    "vocabulary": "https://json-schema.org/draft/2019-09/vocab/applicator",
    "condition": [ 
        { "operation": "has-key", "path": [] }
    ],
    "transform": [
        { "operation": "move", "to": [ "properties", {}, "required" ], "from": [ "required", {} ] }
    ]
}
const test = {
    "title": "`items` is an array, additionalItems is present",
    "from": {
        "required": ["foo"]
    },
    "to": {
        "properties":{
            "foo":{
                "required": true
            }
        }
    }
}
// console.log(applyTest(test, rule));

export {
    applyTest,
    applyRule
}