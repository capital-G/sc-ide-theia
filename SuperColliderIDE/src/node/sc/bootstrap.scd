~n = NetAddr("127.0.0.1", ~port);

~hello = {|id, selector, search|
        var classes;
        search = search.asString.toLower;
        classes = Class.allClasses.select({|x| x.name.asString.toLower.contains(search).and(x.name.asString.beginsWith("Meta_").not)}).collect({|x| x.name.asString});
        ~n.sendMsg("/complete", id, *classes);
};
