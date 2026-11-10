// following variables get injected through theia
// * ~port => udp port from the IDE to send replies to
// * ~theiaQueryLimit => query limit

// keep this in sync w/ SC_QUERY_LIMIT in protocol.ts
~theiaQueryLimit = 50;

// since we want to match case insensitive, we have to build a local cache of
// lower case class names in order to avoid excessive string allocation
~theiaClassNames = Class.allClasses.collect({|c| c.name.asString }).reject({|n| n.beginsWith("Meta_")});
~theiaClassNamesLower = ~theiaClassNames.collect({|n| n.toLower(); });

~classLookup = {|search|
	var hits = [];
	search = search.asString.toLower;
	~theiaClassNamesLower.do({|lower, i|
		lower.contains(search).if({
			hits = hits.add(~theiaClassNames[i]);
		});
	});
	hits.keep(~theiaQueryLimit);
};

~methodLookup = {|search, receiverClass, meta|
	var classes = (receiverClass.isNil).if({
		Class.allClasses
	}, {
		var c = receiverClass.asSymbol.asClass;
		[c] ++ c.superclasses;
	});
	var methods = [];
	// use an identity set for lookup for efficiency
	var seen = IdentitySet.new;
	search = search.asSymbol;
	
	classes.do({|c|
		var base = c;
		meta.if({c = c.class});
		c.methods.select({|method|
			if(search == '', {true}, {method.name.isPrefix(search)})
		}).select({|method|
			// only add if it is not overwritten if receiver clas given
			receiverClass.isNil.if({
				true
			}, {
				seen.includes(method.name).not;
			});
		}).do({|method|
			seen.add(method.name);
			methods = methods.add((
				name: method.name,
				className: base.name,
				isClassMethod: c.isMetaClass,
				// argNames[0] is "this" - but could be nil, which returns 0
				// argCount: (method.argNames.size-1).max(0),
			))
		});
	});
	
	methods.keep(~theiaQueryLimit).collect({|m|
		"%\t%\t%".format(
			m.name,
			m.className,
			m.isClassMethod.if(\c, \i),
		)
	});
};

// this.query, ref.name,ref.ownerClass, ref.isClassMethod ? "class" : "instance"
~argsLookup = {|search, ownerClass, isClassMethod|
	var method;
	var arguments;
	// this should always be found...
	var class = ownerClass.asSymbol.asClass;
	// switch to meta class
	class = isClassMethod.if(class.class, class);
	
	method = class.findRespondingMethodFor(search.asSymbol);
	if(method.isNil, {[]}, {
		method.keyValuePairsFromArgs.clump(2).collect({|p|
			p[1].isNil.if({p[0].asString}, {"%=%".format(p[0], p[1].asCompileString)})
		})
	});
};

// provides env autocomplete lookup by returning the class of an env variable
~envClassLookup = {|name|
	var val = currentEnvironment[name.asSymbol];
	val.isNil.if([], { [val.class.name.asString] });
};

// source locations for go to definition/implementations/references,
// modeled after the lookup and references dialogs of the Qt IDE.
// A reply has to fit into a single udp datagram (9216 bytes on macOS),
// so we stop adding rows before that.
~theiaMaxReplyBytes = 7000;

// maps classes/methods to rows of `path\tcharPos`, where charPos is
// a 0-based byte offset into the file
~theiaLocationRows = {|defs|
	var rows = [];
	var bytes = 0;
	var seen = Set.new;
	defs.do({|def|
		var path = def.filenameSymbol;
		var row;
		path.notNil.if({
			row = "%\t%".format(path, def.charPos);
			(seen.includes(row).not and: {(bytes + row.size) < ~theiaMaxReplyBytes}).if({
				seen.add(row);
				rows = rows.add(row);
				// osc pads strings to 4 bytes
				bytes = bytes + row.size + 4;
			});
		});
	});
	rows;
};

// all implementations of a method name, both class and instance side
~theiaMethodsNamed = {|name|
	var methods = [];
	name = name.asSymbol;
	Class.allClasses.do({|c|
		c.methods.do({|m|
			(m.name == name).if({
				methods = methods.add([c.name.asString.replace("Meta_", ""), m]);
			});
		});
	});
	methods.sort({|a, b| a[0] <= b[0]}).collect(_[1]);
};

~definitionLookup = {|mode, name, receiver, side|
	var class;
	var method;
	switch(mode.asSymbol)
	// the class definition itself
	{\class} {
		class = name.asSymbol.asClass;
		~theiaLocationRows.(class.isNil.if({[]}, {[class]}));
	}
	// the class and all of its methods, including extensions
	{\classImpl} {
		class = name.asSymbol.asClass;
		~theiaLocationRows.(class.isNil.if({[]}, {
			[class] ++ (class.class.methods ? []) ++ (class.methods ? [])
		}));
	}
	// the responding method if the receiver is known, otherwise all implementations
	{\method} {
		(receiver.size > 0).if({
			class = receiver.asSymbol.asClass;
		});
		class.notNil.if({
			(side == "class").if({class = class.class});
			method = class.findRespondingMethodFor(name.asSymbol);
		});
		~theiaLocationRows.(method.notNil.if({[method]}, {~theiaMethodsNamed.(name)}));
	}
	{\methodImpl} {
		~theiaLocationRows.(~theiaMethodsNamed.(name));
	}
	// all methods which reference the symbol, see ScIDE.findReferencesToSymbol
	{\references} {
		var methods = IdentitySet.new;
		(Class.findAllReferences(name.asSymbol) ? []).do({|funcDef|
			var home = funcDef.context.isNil.if({funcDef}, {funcDef.context.homeContext});
			home.isKindOf(Method).if({methods.add(home)});
		});
		~theiaLocationRows.(methods.asArray.sort({|a, b|
			a.ownerClass.name <= b.ownerClass.name
		}));
	}
	{[]};
};

// help browser, modeled after ScIDE.processUrl and HelpBrowser.goTo.
// The IDE serves SCDoc.helpTargetDir and asks to prepare each requested page,
// which renders the schelp source on demand if the html is missing or outdated.
// Replies are `local, path, fragment, query` w/ path relative to the help target dir,
// or `remote, url` for anything outside of it.
~helpTarget = {|url|
	var root = SCDoc.helpTargetDir ++ "/";
	var path;
	(url.scheme == "file").if({
		path = url.asLocalPath;
	});
	(path.notNil and: {path.beginsWith(root)}).if({
		["local", path.drop(root.size), url.fragment ? "", url.query ? ""]
	}, {
		["remote", url.asString]
	});
};

~helpPrepare = {|path|
	var prepared = SCDoc.prepareHelpForURL(URI.fromLocalPath(SCDoc.helpTargetDir +/+ path));
	prepared.isNil.if({
		["local", "BrokenLink.html", path, ""]
	}, {
		~helpTarget.(prepared)
	});
};

// deep links into the class page of the implementation if the receiver is known,
// otherwise the same lookup as HelpBrowser.openHelpFor
~helpFor = {|name, receiver, side|
	var class, method, owner;
	(receiver.size > 0).if({
		class = receiver.asSymbol.asClass;
	});
	class.notNil.if({
		(side == "class").if({class = class.class});
		method = class.findRespondingMethodFor(name.asSymbol);
	});
	method.notNil.if({
		owner = method.ownerClass;
		~helpTarget.(URI("%/Classes/%.html#%%".format(
			SCDoc.helpTargetUrl,
			owner.isMetaClass.if({owner.name.asString.drop(5)}, {owner.name}),
			owner.isMetaClass.if("*", "-"),
			name,
		)));
	}, {
		~helpTarget.(URI(SCDoc.findHelpFile(name.asString)));
	});
};

~sendServerStateUpdate = {|server|
	defer {
		~theiaEmit.("/server", "state",
			server.serverBooting,
			server.serverRunning,
			server.addr.hostname,
			server.addr.port,
			server.unresponsive,
		);
	}
};
~serverLookup = SimpleController(Server.default);
~serverLookup.put(\serverRunning, {|server| ~sendServerStateUpdate.(server)});
~serverLookup.put(\defaultServerRunningChanged, {|server| ~sendServerStateUpdate.(server)});


~theiaIDE = {|id, selector ... searchArgs|
	var reply = try {
		switch(selector)
			{\class} {~classLookup.(*searchArgs)}
			{\method} {~methodLookup.(
				searchArgs[0],
				(searchArgs[1].asString.size>0).if(searchArgs[1], nil),
				searchArgs[2] == "class"
			)}
			{\args} {~argsLookup.(
				searchArgs[0],
				searchArgs[1],
				searchArgs[2] == "class",
			)}
			{\envClass} {~envClassLookup.(searchArgs[0])}
			{\definition} {~definitionLookup.(*searchArgs)}
			{\helpPrepare} {~helpPrepare.(searchArgs[0])}
			{\helpFor} {~helpFor.(*searchArgs)}
			{\classLibDir} {[Platform.classLibraryDir]}
			{\helpTargetDir} {[SCDoc.helpTargetDir]};
	} {|err|
		// reply anyways, otherwise the IDE waits until the timeout
		err.reportError;
		nil;
	};
	// reply could be empty on unknown lookup
	~theiaEmit.("/reply", *([id] ++ (reply ? [])));
};
