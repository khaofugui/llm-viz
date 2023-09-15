import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { iterLocalStorageEntries } from "@/src/utils/localstorage";
import { Vec3 } from "@/src/utils/vector";
import { CompLibrary, ICompDef, ISubLayoutArgs, ISubLayoutPort } from "../comps/CompBuilder";
import { IEditSnapshot, PortType } from "../CpuModel";
import { createInitialEditSnapshot, ILSComp, ILSState, wiresFromLsState, wiresToLsState } from "../ImportExport";
import { regFileDemo, riscvBasicSchematic } from "./RiscvBasic";

export interface ILocalSchematic {
    id: string;
    name: string;
    cpuStateStr: string;
}

export class SchematicLibrary {

    // builtins are shipped with this app
    // customs are from local-storage

    builtinSchematics = new Map<string, ISchematicDef>();
    customSchematics = new Map<string, ISchematicDef>();

    localSchematics: ILocalSchematic[] = [
        riscvBasicSchematic,
        regFileDemo,
    ];

    constructor() {
    }

    public populateSchematicLibrary(compLibrary: CompLibrary) {
        this.builtinSchematics.clear();
        this.customSchematics.clear();

        this.addLocalSchematics(compLibrary);
        this.readFromLocalStorage(compLibrary);
    }

    public addLocalSchematics(compLibrary: CompLibrary) {
        for (let schematic of this.localSchematics) {

            let model: ILSState | undefined;
            try {
                model = JSON.parse(schematic.cpuStateStr!) as ILSState;

            } catch (e) {
                console.error(`Error parsing schematic ${schematic.id}/${schematic.name} ${e}`);
                return;
            }

            if (!model) {
                return;
            }

            this.builtinSchematics.set(schematic.id, {
                id: schematic.id,
                name: schematic.name,
                model: wiresFromLsState(createInitialEditSnapshot(), model, compLibrary),
                hasEdits: false,
                schematicStr: "",
            });
        }
    }

    deleteCustomSchematic(id: string) {
        this.customSchematics.delete(id);
        localStorage.removeItem(this.schematicLocalStorageKey(id));
    }

    public getSchematic(id: string): ISchematicDef | undefined {
        return this.builtinSchematics.get(id) || this.customSchematics.get(id);
    }

    private readFromLocalStorage(compLibrary: CompLibrary) {
        let customSchematics = this.customSchematics;
        iterLocalStorageEntries((key, schematicStr) => {
            let schematic: ILSSchematic | undefined;
            if (!key.startsWith('schematic-')) {
                return;
            }

            try {
                schematic = JSON.parse(schematicStr!) as ILSSchematic;

            } catch (e) {
                console.error(`Error parsing schematic ${key}: ${e}`);
                return;
            }

            if (!schematic) {
                return;
            }

            customSchematics.set(schematic.id, {
                id: schematic.id,
                name: schematic.name,
                model: wiresFromLsState(createInitialEditSnapshot(), schematic.model, compLibrary),
                compArgs: compArgsFromLsState(schematic.compArgs),
                hasEdits: false,
                schematicStr: schematicStr!,
            });
        });
    }

    public addCustomSchematic(name: string) {
        // create random string of 8 chars
        let id = `c-${Math.random().toString(36).substring(2, 10)}`;

        let schematic: ISchematicDef = {
            id: id,
            name: name,
            model: createInitialEditSnapshot(),
            hasEdits: false,
        };
        this.customSchematics.set(id, schematic);
        this.saveToLocalStorage(schematic.id);
        return schematic;
    }

    public saveToLocalStorage(id: string) {
        let schematic = this.customSchematics.get(id);

        if (schematic) {
            let lsSchematic: ILSSchematic = {
                id: schematic.id,
                name: schematic.name,
                model: wiresToLsState(schematic.model),
                compArgs: compArgsToLsState(schematic.compArgs),
            };
            localStorage.setItem(this.schematicLocalStorageKey(schematic.id), JSON.stringify(lsSchematic));
        } else if (this.builtinSchematics.get(id)) {
            // console.log(`Can't update builtin schematic ${id}`);
        } else {
            console.error(`Schematic ${id} not found`);
        }
    }

    private schematicLocalStorageKey(id: string) {
        return `schematic-${id}`;
    }
}

export interface ILSSchematic {
    id: string;
    name: string;
    model: ILSState;
    compArgs?: ILSCompArgs;
}

export interface ILSCompArgs {
    w: number;
    h: number;
    ports: ILSCompPort[];
}

export interface ILSCompPort {
    id: string;
    name: string;
    type: PortType;
    x: number;
    y: number;
    width?: number;
}

export interface ISchematicDef {
    id: string;
    name: string;
    model: IEditSnapshot;
    compArgs?: ISchematicCompArgs; // a schematic may get wrapped into a component

    hasEdits: boolean;
    // when we switch between models, want to keep as much state around as possible
    undoStack?: IEditSnapshot[];
    redoStack?: IEditSnapshot[];
    mtx?: AffineMat2d;
    schematicStr?: string; // for LS update detection
}

export interface ISchematicCompArgs {
    size: Vec3;
    ports: ISubLayoutPort[];
}

function compArgsToLsState(compArgs?: ISchematicCompArgs): ILSCompArgs | undefined {
    if (!compArgs) {
        return undefined;
    }
    return {
        w: compArgs.size.x,
        h: compArgs.size.y,
        ports: compArgs.ports.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            x: p.pos.x,
            y: p.pos.y,
            width: p.width,
        })),
    };
}

function compArgsFromLsState(lsCompArgs?: ILSCompArgs): ISchematicCompArgs | undefined {
    if (!lsCompArgs) {
        return undefined;
    }
    return {
        size: new Vec3(lsCompArgs.w, lsCompArgs.h),
        ports: lsCompArgs.ports.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            pos: new Vec3(p.x, p.y),
            width: p.width,
        })),
    };
}