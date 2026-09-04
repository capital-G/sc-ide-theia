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

~theiaIDE = {|id, selector ... searchArgs|
	var reply = switch(selector)
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
		{\envClass} {~envClassLookup.(searchArgs[0])};
	// reply could be empty on unknown lookup
	~theiaEmit.(id, reply ? []);
};
