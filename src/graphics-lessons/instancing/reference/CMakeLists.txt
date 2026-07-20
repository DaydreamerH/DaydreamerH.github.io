add_executable(23_instancing instancing_quads.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(23_instancing glfw opengl32)
endif()

foreach(FILE_NAME instancing.vs instancing.fs)
    add_custom_command(TARGET 23_instancing POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:23_instancing>/${FILE_NAME}"
    )
endforeach()
