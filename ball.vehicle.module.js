/**
 * @license
 * Copyright 2010-2023 Three.js Authors
 * SPDX-License-Identifier: MIT
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const loggingConstructs = false;
const loggingPlacement = false;

let   pointSeparation = 0.05;
let   ballSafeDistance = 3;
let   defaultTrackColor = "grey";
let   layout;
let   switches = { };
let   definedColors = {};
let   blocks = { };

function cvcos( degrees ) {
	return Math.cos(degrees / 180 * 3.14159);
}

function cvsin( degrees ) {
	return Math.sin(degrees / 180 * 3.14159);
}

function pointFor( track, index) {
	return track.points[index];	
}

function move( vehicle ) {

	let distance = vehicle.speed + vehicle.getSafeDistance();
	let furthest = movePlaces(vehicle, vehicle.point, distance);
	
	if (furthest.count < vehicle.getSafeDistance()) {
		return;
	}
	
	vehicle.track.setOccupied( vehicle, false);
	
	let targetPoint = vehicle.point + vehicle.speed;
	while (targetPoint > (vehicle.track.getNumberOfPoints() - 1) ) {
		vehicle.track.crossedBy(vehicle);
		targetPoint = targetPoint - vehicle.track.points.length;
		vehicle.track = vehicle.track.getNextTrack(vehicle);
	}
	vehicle.point = targetPoint;
	
	vehicle.track.setOccupied( vehicle, true);

	if (vehicle.active) {
		vehicle.reposition();
	}

}
	
function movePlaces( vehicle, point, count ) {
	
	let currentTrack = vehicle.track;
	let currentPoint = point;
	let result = { currentTrack, point, count: 0};	
	for (let i = 1; i <= count; i++) {
		
	   	currentPoint++;
	   	if (currentPoint >= currentTrack.getNumberOfPoints()) {
			currentPoint = 0;
			let lastTrack = currentTrack;
			currentTrack = currentTrack.getNextTrack(vehicle);
			while (currentTrack.getNumberOfPoints() == 0) {
				// pass over switches
//				currentTrack.crossedBy(vehicle);
				if (!currentTrack.isPrevTrack(lastTrack)) {
					return result;
				}
				currentTrack = currentTrack.getNextTrack(vehicle);
			}					   
	   	}				
		
	   	if ( currentTrack.isOccupied(currentPoint) ) {
			   return result;
	   	}	

		result = { currentTrack, currentPoint, count: i};

	}	
	
	return result;	
		
}

function lookup( jobj , field , defaultValue ) {
	
	if (jobj.hasOwnProperty(field)) {
		return jobj[field];
	}	
	return defaultValue;
	
}

function defineColor(name, r , g , b ) {
	let single = r*16*16*16*16  + g*16*16 + b;
	definedColors[name] = single;
}

function lookupColor(name) {
	if (definedColors.hasOwnProperty(name)) {
		return definedColors[name];
	}
	return 15*16*16*16*16 + 15*16*16 + 15;
}

class TrackVector {

	constructor( x, y, z, neswAngle, elevAngle) {
		this.x = x;
		this.y = y;
		this.z = z; 
		this.neswAngle = neswAngle;
		this.elevAngle = elevAngle;
	}	
	
	asString() {
		return "( ("+this.x+","+this.y+","+this.z+") "+this.neswAngle+" "+this.elevAngle+" )";
	}
}

class SimpleTrackLayout {
	
	constructor( config, innerWidth , innerHeight) {
		
		this.config = config;
		this.fluid = [ ];
		this.fixed = [ ];
		
		if (!config.hasOwnProperty("camera")) {
			config.camera = { };	
		}
		
		let pos = {};
		if (config.camera.hasOwnProperty("position")) {
			pos = config.camera.position;	
		} else {
			pos = {"x":0,"y":0,"z":3};	
		}
		
		let trg = {};
		if (config.camera.hasOwnProperty("target")) {
			trg = config.camera.target;	
		} else {
			trg = {"x":0,"y":0,"z":0};	
		}
//		if (!config.camera.hasOwnProperty("target")) {
//			config.camera.target = {"x":0,"y":0,"z":0};	
//		}
		
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 75, innerWidth / innerHeight, 0.1, 1000 );
		this.camera.position.x = pos.x;
		this.camera.position.y = pos.y;
		this.camera.position.z = pos.z;

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize( innerWidth, innerHeight );
		
		this.controls = new OrbitControls( this.camera, this.renderer.domElement );
		this.camera.position.set( pos.x , pos.y , pos.z );
//		this.camera.target = trg;
		this.controls.update();	
			
		const light = new THREE.DirectionalLight(0xFFFFFF, 3);
		light.position.set(-1, 2, 4);
		this.scene.add(light);
		
		layout = this;

	}
	
	getDomElement() {

		return this.renderer.domElement ;
		
	}
	
	addFixed(f) {
		this.fixed.push( f );
		for (const dob of f.getDisplayableObject()) {
			this.scene.add( dob );
		}
	}

	addFluid(v) {
		this.fluid.push( v );
		const dobjs = v.getDisplayableObject();
		for (const dob of dobjs) {
			this.scene.add( dob );
		}
	}
	
	addStraight( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new StraightTrack( this.currentTrack.endTv, action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFixed(this.currentTrack);
		return this.currentTrack;	
	}
	
	addLeftCurve( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new LeftCurveTrack( this.currentTrack.endTv, action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFixed(this.currentTrack);
		return this.currentTrack;	
	}
	
	addRightCurve( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new RightCurveTrack( this.currentTrack.endTv, action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFixed(this.currentTrack);
		return this.currentTrack;	
	}
	
	addPainter( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new PainterTrack( this.currentTrack.endTv , action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addSwitch( action ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new SwitchTrack( this.currentTrack.endTv , action );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addSortSwitch( label ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new SortSwitch( this.currentTrack.endTv , label );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addSpraySwitch( label ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new SpraySwitch( this.currentTrack.endTv , label );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addStop( jobj ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new StopTrack( this.currentTrack.endTv , jobj );
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid(this.currentTrack);
		return this.currentTrack;	
	}
	
	addBallVehicle( jobj , track , position ) {
		let newBall = new BallVehicle( jobj );
		newBall.position(track, position);
		this.addFluid(newBall);
		return newBall;
	}
	
	addGenerator( jobj ) {
		let jobjtv = jobj["tv"];
		let tv = new TrackVector(jobjtv["x"], jobjtv["y"], jobjtv["z"], jobjtv["neswAngle"], jobjtv["elevAngle"]);
		this.currentTrack = new RegularGenerator(tv, jobj);
		this.addFluid( this.currentTrack );
	}
	
	addDisposal( jobj ) {
		this.previousTrack = this.currentTrack;
		this.currentTrack = new Disposal(this.currentTrack.endTv, jobj);
		this.previousTrack.setNextTrack(this.currentTrack);
		this.addFluid( this.currentTrack );
		return this.currentTrack;	
	}
	
	setCurrentTrack( label ) {
		let track = switches[label];
		this.currentTrack = track;
	}
	
	getCurrentTrack() {
		return this.currentTrack;
	}
	
	connectTo( label ) {
		if (!switches.hasOwnProperty(label)) {
			console.log("Undefined label: "+label);
		}
		let track = switches[label];
		this.currentTrack.setNextTrack(track);
		track.setPrevTrack(this.currentTrack);
		this.setCurrentTrack( label );
		const xd = this.currentTrack.endTv.x - track.tv.x;
		const yd = this.currentTrack.endTv.y - track.tv.y;
		const zd = this.currentTrack.endTv.z - track.tv.z;
		const dist = Math.sqrt(xd*xd + yd*yd + zd*zd);
		if (dist > 0.01) {
			console.log("Too far apart: "+this.currentTrack.endTv.asString()+" -> ("+track.label+") "+track.tv.asString()+"  "+dist);
			this.currentTrack.color = 0xff0000;
		}
	}
	
	move() {
		let newFluid = [];
		for (const v of this.fluid) {
  			v.move();
  			if (v.active) {
				newFluid.push(v);	  
			}
		}
		
		this.fluid = newFluid;

		this.renderer.render( this.scene, this.camera );

	}
	
	layout() {
		
		this.performBlock(this.config["layout"]);
		
	}
	
	performBlock ( block ) {
		
		for( let i = 0; i < block.length; i++) {
    		this.performAction(block[i]);
		}
		
	}
	
	performAction( action ) {
		
		let type = action["type"];
		
		if (type === "setting") {
			let name = action["name"];
			if (name === "pointSeparation") {
				pointSeparation = action["value"];
				return;
			}			
			if (name === "ballSafeDistance") {
				ballSafeDistance = action["value"];
				return;
			}			
			if (name === "defaultTrackColor") {
				defaultTrackColor = action["value"];
				return;
			}			
			console.log("Unknown setting: "+name);
			return;
		}
		
		if (type === "defineColor") {
			defineColor(action["name"] ,lookup(action,"r",0) ,lookup(action,"g",0) ,lookup(action,"b",0));
			return;			
		}
		
		if (type === "generator") {
			this.addGenerator(action);
			return;			
		}
		
		if (type === "straight") {
			this.addStraight( action );			
			return;			
		}
		
		if (type === "painter") {
			this.addPainter( action );			
			return;			
		}
		
		if (type === "left") {
			this.addLeftCurve( action );
			return;			
		}
		
		if (type === "right") {
			this.addRightCurve( action );
			return;			
		}
		
		if (type === "disposal") {
			this.addDisposal( action );
			return;			
		}
		
		if (type === "switch") {
			this.addSwitch( action );
			return;			
		}
		
		if (type === "sprayer") {
			this.addSpraySwitch( action );
			return;			
		}
		
		if (type === "sort") {
			this.addSortSwitch( action );
			return;			
		}
		
		if (type === "stop") {
			this.addStop( action );
			return;			
		}
		
		if (type === "connectTo") {
			this.connectTo( action["label"] );
			return;			
		}
		
		if (type === "setCurrent") {
			this.setCurrentTrack( action["label"] );
			return;			
		}
		
		if (type === "block") {
			const label = action["label"];
			blocks[label] = action["layout"];
			return;			
		}
		
		if (type === "run") {
			const label = action["label"];
			let repeat = lookup( action, "repeat" , 1);
			for (let i = 0; i < repeat; i++) {
				this.performBlock( blocks[label]);
			}
			return;			
		}
		
		if (type === "log") {
			console.log(action["message"]);
			return;			
		}
		
	}
	
	getFixed() {
		return this.fixed;
	}
	
	getFluid() {
		return this.fluid;
	}
	
}

class Track {
	constructor ( tv ) {
		this.tv = tv;
		this.points = [];
	} 	

	getNextTrack(vehicle) {
		return this.nextTrack;
	}

	setNextTrack( track ) {
		this.nextTrack = track;
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevTrack;	
	}
	
	setPrevTrack( track ) {
		this.prevTrack = track;
	}

	getNumberOfPoints() {
		return this.points.length;
	}
	
	isOccupied( point ) {
		return this.places[point];
	}
	
	setOccupied( vehicle , taken) {
		this.places[vehicle.point] = taken;
	}
	
	isPrevTrack( track ) {
		return track === this.prevTrack;
	}
	
	logConstruct( text ) {
		if (loggingConstructs) {
			console.log(text+",");
		}
	}
	
	logPlacement( text ) {
		if (loggingPlacement) {
			console.log(text);
		}
	}
	
	crossedBy( vehicle ) {
		
	}

}

class PainterTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.color =  lookupColor( jobj["color"] );
		this.type = "painter";
		this.logConstruct(JSON.stringify(this));
		this.points = [];
		this.places = [];
		this.endTv = tv;
		this.active = true;
	}

	getDisplayableObject( ) {

//		this.mesh = new THREE.Mesh( new THREE.SphereGeometry( 0.05, 7, 7 ), new THREE.MeshBasicMaterial( { color: this.color } ) ); 
//		this.mesh.position.set(this.tv.x,this.tv.y,this.tv.z);
//		return [ this.mesh ];
		
		
		var geo = new THREE.WireframeGeometry( new THREE.SphereGeometry( 0.07, 3, 3 ) ); // or WireframeGeometry( geometry ) EdgesGeometry
		var mat = new THREE.LineBasicMaterial( { color: this.color, linewidth: 2 } );
		this.wireframe = new THREE.LineSegments( geo, mat );
		this.wireframe.position.set(this.tv.x,this.tv.y,this.tv.z);

		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ this.wireframe ];

	}

	move() {
		this.wireframe.rotation.x += 0.02;
		this.wireframe.rotation.y += 0.01;
	}
	
	isPrevTrack( track ) {
		return true;
	}
	
	crossedBy( vehicle ) {
//		vehicle.changeColor(this.color);
		vehicle.ballMesh.material.color.set(this.color);
		vehicle.color = this.color;
	}

}

class StopTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.type = "stop";
		this.frequency = jobj["frequency"];
		this.starts = jobj["starts"];
		this.stops = jobj["stops"];
		this.logConstruct(JSON.stringify(this));
		this.counter = 0;
		this.open = false;
		this.points = [];
		this.places = [];
		this.endTv = tv;
		this.active = true;
	}

	getDisplayableObject( ) {
		
		this.mesh = new THREE.Mesh( new THREE.SphereGeometry( 0.02, 3, 3 ), new THREE.MeshBasicMaterial( { color: 0xffffff } ) ); 
		this.mesh.position.set(this.tv.x,this.tv.y,this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ this.mesh ];

	}

	move() {
		this.counter++;
		if (this.counter >= this.frequency) {
			this.counter = 0;
		}
		if (this.counter == this.starts) {
			this.open = true;
			this.mesh.color = 0xffffff;
		}
		if (this.counter == this.stops) {
			this.open = false;
			this.mesh.color = 0x333333;
		}
	}
	
	isPrevTrack( track ) {
		return this.open;
	}

}

class SwitchTrack extends Track {
	
	constructor ( tv , jobj ) {
		super (tv);
		this.label = jobj["label"];
		this.type = "switch";
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.outIndex = 0;
		this.outEvery = lookup( jobj , "every" , 37);
		this.counter = 0;
		this.active = true;
		switches[this.label] = this;
	}

	getDisplayableObject( ) {

		const soMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.02, 3, 3 ), new THREE.MeshBasicMaterial( { color: 0x888888 } ) ); 
		soMesh.position.set(this.tv.x,this.tv.y,this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ soMesh ];

	}

	move() {
		this.counter++;
		if ((this.counter % this.outEvery) == 0) {
			this.outIndex++;
			if (this.outIndex >= this.nexts.length) {
				this.outIndex = 0;
			}
		}
	}
	
	getNextTrack(vehicle) {
		return this.nexts[this.outIndex];	
	}
	
	setNextTrack( track ) {
		this.nexts.push( track );
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevs[this.inIndex];	
	}
	
	setPrevTrack( track ) {
		this.prevs.push( track );
	}
	
	isPrevTrack( track ) {
		return true;
	}

}

class SortSwitch extends SwitchTrack {
	
	constructor ( tv , jobj ) {
		super (tv , jobj);
		this.label = jobj["label"];
		this.type = "sort";
		this.defaultColor = lookupColor( lookup(jobj, "defaultColor", defaultTrackColor));
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.nextTracks = {};
		this.active = true;
	}

	move() {

	}
	
	getNextTrack(vehicle) {

		if (this.nextTracks.hasOwnProperty(vehicle.color)) {
			return this.nextTracks[vehicle.color];
		}
		if (this.nextTracks.hasOwnProperty(this.defaultColor)) {
			return this.nextTracks[this.defaultColor];
		}
		return this;	
	}
	
	setNextTrack( track ) {
		this.nextTracks[track.color] = track;
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		return this.prevTrack;	
	}
	
	setPrevTrack( track ) {
		this.prevTrack = track;
	}
	
}

class SpraySwitch extends SwitchTrack {
	
	constructor ( tv , jobj ) {
		super (tv , jobj);
		this.label = jobj["label"];
		this.random = lookup(jobj, "random", true);
		this.type = "spray";
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.active = true;
	}

	move() {

	}
	
	crossedBy( vehicle ) {
		if (this.random) {
			this.outIndex = Math.floor(Math.random()*this.nexts.length);
		} else {
			this.outIndex++;
			if (this.outIndex >= this.nexts.length) {
				this.outIndex = 0;
			}
		}
	}
	
}

class StopSwitch extends SwitchTrack {
	
	constructor ( tv , label ) {
		super (tv);
		this.label = label;
		this.type = "stop";
		this.logConstruct(JSON.stringify(this));
		this.endTv = tv;
		this.nexts = [];
		this.prevs = [];
		this.places = [];
		this.cycle = 4000;
		this.stops = 80;
		this.counter = 0;
		this.open = true;
		this.active = true;
	}

	getDisplayableObject( ) {

		const soMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.02, 3, 3 ), new THREE.MeshBasicMaterial( { color: 0x888888 } ) ); 
		soMesh.position.set(this.tv.x,this.tv.y,this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ soMesh ];

	}

	move() {
		this.counter++;
		if ((this.counter % this.cycle) == 0) {
			this.open = true;
		}
		if ((this.counter % this.cycle) == this.stops) {
			this.open = false;
		}
	}
	
	getNextTrack(vehicle) {
		return this.nextTrack;	
	}
	
	setNextTrack( track ) {
		this.nextTrack = track;
		track.setPrevTrack(this);
	}
	
	getPrevTrack() {
		if (!this.open) {
			return this;
		}
		return this.prevTrack;	
	}
	
	setPrevTrack( track ) {
		this.prevTrack = track;
	}
	
}

class StraightTrack extends Track  {
	
	constructor ( tv, jobj ) {
		super(tv);
		this.length = jobj["length"];
		this.color =  lookupColor( lookup( jobj , "color" , defaultTrackColor ));
		this.type = "straight";
		this.logConstruct(JSON.stringify(this));
		this.endTv = new TrackVector(tv.x+(this.length*cvcos(tv.neswAngle)), tv.y+(this.length*cvsin(tv.neswAngle)), tv.z, tv.neswAngle, tv.elevAngle);
	}

	getDisplayableObject( ) {
		const lineMaterial = new THREE.LineBasicMaterial( { color: this.color } );
		const stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x, this.tv.y, this.tv.z ) );
		stPoints.push( new THREE.Vector3( this.endTv.x, this.endTv.y, this.endTv.z ) );
			
		const lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		const line = new THREE.Line( lineGeometry, lineMaterial );

		let linePoints = Math.ceil(this.length / pointSeparation);
		this.points = [];
		this.places = [];
		let deltaX = (this.endTv.x-this.tv.x) / linePoints;
		let deltaY = (this.endTv.y-this.tv.y) / linePoints;
		let deltaZ = (this.endTv.z-this.tv.z) / linePoints;
		for (let i =0; i < linePoints; i++) {
   			this.points.push(new THREE.Vector3( deltaX * i + this.tv.x, deltaY * i + this.tv.y, deltaZ * i + this.tv.z));
   			this.places.push( false);
		}
		
		this.logPlacement(this.type+": from "+this.tv.asString()+" to "+this.endTv.asString());
		
		return [ line ];
	}

}

class LeftCurveTrack extends Track {
	
	constructor ( tv, jobj ) {
		super(tv);
		this.radius = jobj["radius"];
		this.angle = jobj["angle"];
		this.color =  lookupColor( lookup( jobj , "color" , defaultTrackColor ));
		this.type = "left";
		this.logConstruct(JSON.stringify(this));
		
		this.cx = tv.x + (cvcos(tv.neswAngle+90) * this.radius);
		this.cy = tv.y + (cvsin(tv.neswAngle+90) * this.radius);
		
		const beta = 90 - tv.neswAngle;
		
		const ex = this.cx + (cvcos(this.angle-beta) * this.radius);
		const ey = this.cy + (cvsin(this.angle-beta) * this.radius);
		
		const ea = tv.neswAngle + this.angle;
		
		this.fromAngle = (this.tv.neswAngle - 90)  / 180 * Math.PI;
		this.toAngle =  (this.tv.neswAngle + this.angle - 90)  / 180 * Math.PI;
		
		this.endTv = new TrackVector(ex, ey, tv.z, ea, tv.elevAngle);
	}

	getDisplayableObject( ) {

		const curve = new THREE.EllipseCurve(
								this.cx,  this.cy, 
								this.radius, this.radius,
 								this.fromAngle,  this.toAngle ,
								false,            // aClockwise
								0                 // aRotation
							);

		let lcNum = Math.ceil(Math.PI * 2 * this.radius * this.angle / 360 / pointSeparation) + 1;
		const lcp = curve.getPoints( lcNum );
		this.points = [];
		this.places = [];
		for (let i =0; i < lcNum; i++) {
			let lcpt = lcp[i];
			lcpt.z = this.tv.z;
			this.points.push( lcpt );
			this.places.push( false );
		}

		const geometry = new THREE.BufferGeometry().setFromPoints( curve.getPoints( 50 ) );
		const material = new THREE.LineBasicMaterial( { color: this.color } );
		
		this.logPlacement(this.type+": from "+this.tv.asString()+" to "+this.endTv.asString());
		
		return [ new THREE.Line( geometry, material ) ];

	}

}

class RightCurveTrack extends Track {
	
	constructor ( tv, jobj ) {
		super(tv);
		this.radius = jobj["radius"];
		this.angle = jobj["angle"];
		this.color =  lookupColor( lookup( jobj , "color" , defaultTrackColor ));
		this.type = "right";
		this.logConstruct(JSON.stringify(this));
		
		this.cx = tv.x + (cvcos(tv.neswAngle-90) * this.radius);
		this.cy = tv.y + (cvsin(tv.neswAngle-90) * this.radius);
		
		const beta = 90 - this.angle + tv.neswAngle;
		
		const ex = this.cx + (cvcos(beta) * this.radius);
		const ey = this.cy + (cvsin(beta) * this.radius);
		
		const ea = tv.neswAngle - this.angle;
		
		this.fromAngle = (this.tv.neswAngle + 90)  / 180 * Math.PI;
		this.toAngle =  (beta)  / 180 * Math.PI;
		
		this.endTv = new TrackVector(ex, ey, tv.z, ea, tv.elevAngle);
	}

	getDisplayableObject( ) {

		const curve = new THREE.EllipseCurve(
								this.cx,  this.cy, 
								this.radius, this.radius,
 								this.fromAngle,  this.toAngle ,
								true,            // aClockwise
								0                 // aRotation
							);

		let rcNum = Math.ceil(Math.PI * 2 * this.radius * this.angle / 360 / pointSeparation) + 1;
		const rcp = curve.getPoints( rcNum );
		this.points = [];
		this.places = [];
		for (let i =0; i < rcNum; i++) {
			let rcpt = rcp[i];
			rcpt.z = this.tv.z;
			this.points.push( rcpt );
			this.places.push( false );
		}

		const geometry = new THREE.BufferGeometry().setFromPoints( curve.getPoints( 50 ) );
		const material = new THREE.LineBasicMaterial( { color: this.color } );
		
		this.logPlacement(this.type+": from "+this.tv.asString()+" to "+this.endTv.asString());
		
		return [ new THREE.Line( geometry, material ) ];

	}

}

class RegularGenerator extends Track {
	
	constructor ( tv , jobj ) {
		super(tv);
		this.every 	= lookup(jobj, "every", 10);
		this.max 	= lookup(jobj, "max" , -1);
		this.balls = [];
		let jarr = jobj["balls"];
		for( let i = 0; i < jarr.length; i++) {
    		this.balls.push(jarr[i]);
		}
		this.type = "generator";
		this.index = 0;
		this.created = 0;
		this.colorsIndex = 0;
		this.endTv = tv;
		this.active = true;
	}

	getDisplayableObject( ) {

		let firstBall = this.balls[0];
		let genColor = lookupColor(firstBall["color"]);
		if (this.balls.length > 1) {
			genColor = 0xffffff;
		}
		this.ballMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.06, 4, 4 ), new THREE.MeshPhongMaterial( { color: genColor } ) ); 
		this.ballMesh.position.set(this.tv.x, this.tv.y, this.tv.z);
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ this.ballMesh ];

	}

	move() {
		this.index++;
		if (this.index >= this.every) {
			this.index = 0;
			this.created ++;
			if ((this.max == -1) | (this.max >= this.created)) {
				if (this.nextTrack.isOccupied(0)) {
					this.created--;
					return;
				}
				this.colorsIndex++;
				if (this.colorsIndex >= this.balls.length) {
					this.colorsIndex = 0;
				}
				let currentBall = this.balls[this.colorsIndex];
				let newBall = layout.addBallVehicle( currentBall, this.nextTrack, 0 );
				this.nextTrack.setOccupied(newBall, true);
			}
		}
	}

}

class Disposal extends Track {
	
	constructor ( tv , jobj ) {
		super(tv);
		this.type = "disposal";
		this.logConstruct(JSON.stringify(this));
		this.active = true;
		this.endTv = tv;
	}

	getDisplayableObject( ) {

		const arm = 0.04;
		
		const lineMaterial = new THREE.LineBasicMaterial( { color: 0xff0000 } );
		
		let stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x-arm, this.tv.y+arm, this.tv.z ) );
		stPoints.push( new THREE.Vector3( this.tv.x+arm, this.tv.y-arm, this.tv.z ) );
		let lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		this.line1 = new THREE.Line( lineGeometry, lineMaterial );
		
		stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x-arm, this.tv.y, this.tv.z+arm ) );
		stPoints.push( new THREE.Vector3( this.tv.x+arm, this.tv.y, this.tv.z-arm ) );
		lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		this.line2 = new THREE.Line( lineGeometry, lineMaterial );
		
		stPoints = [];
		stPoints.push( new THREE.Vector3( this.tv.x, this.tv.y+arm, this.tv.z-arm ) );
		stPoints.push( new THREE.Vector3( this.tv.x, this.tv.y-arm, this.tv.z+arm ) );
		lineGeometry = new THREE.BufferGeometry().setFromPoints( stPoints );			
		this.line3 = new THREE.Line( lineGeometry, lineMaterial );
		
		this.logPlacement(this.type+": on "+this.tv.asString());
		
		return [ this.line1 , this.line2 , this.line3 ];

	}

	move() {
//		this.line1.rotation.x += 0.01;
//		this.line2.rotation.y += 0.01;
//		this.line3.rotation.z += 0.01;
	}
	
	getNumberOfPoints() {
		return 10000;
	}
	
	isOccupied( point ) {
		return false;
	}
	
	setOccupied( vehicle , taken) {
		vehicle.active = false;
//		layout.fluid.remove(vehicle);
		layout.scene.remove(vehicle.getSceneObject());
	}

}

class BallVehicle {

	constructor( jobj ) {

		this.maxSpeed 	= lookup( jobj , "maxSpeed" , 1);
		this.color		= lookupColor(jobj["color"]);
		this.speed      = lookup( jobj , "speed" , 1);
		this.safeDistance = lookup( jobj , "ballSafeDistance" , ballSafeDistance);
		this.active 	= true;
		this.type 		= 'Ball';

	}
 
	position (track, point) {
		this.track 		= track;
		this.point 		= point;
	}
	
	reposition() {
		this.ballPoint = pointFor(this.track, this.point);
		this.ballMesh.position.set(this.ballPoint.x, this.ballPoint.y, this.ballPoint.z);
	}
	
	getDisplayableObject( ) {

		this.ballMesh = new THREE.Mesh( new THREE.SphereGeometry( 0.05, 5, 5 ), new THREE.MeshPhongMaterial( { color: this.color } ) ); 
		this.reposition();
		return [ this.ballMesh ];

	}
	
	getSceneObject() {
		return this.ballMesh ;
	}
	
	changeColor( newColor) {
		this.ballMesh.color = newColor;
	}
	
	move() {
		if (this.color == 0x00ff00) {
			let a = this.color;
		}
		move(this);
	}

	getSafeDistance() {
		return this.safeDistance;
	}
}

export { SimpleTrackLayout, BallVehicle , move };
