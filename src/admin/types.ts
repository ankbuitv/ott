import type {ChannelDraft,StudioChannel} from './data';
import type {VodState} from '../lib/vod-client';
export type Activity={id:string;message:string;time:string};
export type StudioContext={
 channels:StudioChannel[];
 vod:VodState&{refresh:()=>void};
 activities:Activity[];
 storageAvailable:boolean;
 save:(draft:ChannelDraft,editingId?:string)=>string|null;
 remove:(id:string)=>void;
 reset:()=>void;
};
